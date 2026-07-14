import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { embedTexts, generateJsonCompletion, transcribeAudioBlob } from "@/lib/gemini.server";
import { getOrCreateWorkspace } from "@/lib/workspace.functions";

// ============ Transcription ============

export const transcribeMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: meeting, error } = await supabase
      .from("meetings")
      .select("id, workspace_id, audio_path, title")
      .eq("id", data.meetingId)
      .single();
    if (error) throw new Error(error.message);
    if (!meeting.audio_path) throw new Error("Meeting has no audio");

    await supabase.from("meetings").update({ status: "transcribing" }).eq("id", meeting.id);

    // Download audio via signed URL
    const { data: signed } = await supabase.storage
      .from("meeting-audio")
      .createSignedUrl(meeting.audio_path, 600);
    if (!signed?.signedUrl) throw new Error("Could not sign audio URL");
    const audioResp = await fetch(signed.signedUrl);
    if (!audioResp.ok) throw new Error("Failed to fetch audio");
    const audioBlob = await audioResp.blob();

    // Derive filename extension from audio_path
    const ext = meeting.audio_path.split(".").pop() || "webm";

    let transcript: string;
    try {
      transcript = await transcribeAudioBlob(audioBlob, `recording.${ext}`);
    } catch (error) {
      await supabase
        .from("meetings")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", meeting.id);
      throw error;
    }

    await supabase
      .from("transcripts")
      .upsert(
        { meeting_id: meeting.id, workspace_id: meeting.workspace_id, content: transcript },
        { onConflict: "meeting_id" },
      );

    return { transcript, meetingId: meeting.id };
  });

// ============ AI Analysis (action items + decisions + risks + summary) ============

const AnalysisSchema = z.object({
  summary: z.array(z.string()),
  action_items: z.array(
    z.object({
      title: z.string(),
      description: z.string().nullable(),
      assignee_name: z.string().nullable(),
      due_date: z.string().nullable(), // ISO YYYY-MM-DD or null
      priority: z.enum(["low", "medium", "high"]),
    }),
  ),
  decisions: z.array(
    z.object({
      statement: z.string(),
      context: z.string().nullable(),
      tags: z.array(z.string()),
    }),
  ),
  risks: z.array(
    z.object({
      description: z.string(),
      category: z.enum([
        "delay",
        "resource",
        "technical",
        "budget",
        "dependency",
        "client",
        "other",
      ]),
      severity: z.enum(["low", "medium", "high"]),
      mitigation: z.string().nullable(),
    }),
  ),
});

type Analysis = z.infer<typeof AnalysisSchema>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const analyzeMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: meeting, error: mErr } = await supabase
      .from("meetings")
      .select("id, workspace_id, project_id, title")
      .eq("id", data.meetingId)
      .single();
    if (mErr) throw new Error(mErr.message);

    const { data: transcript, error: tErr } = await supabase
      .from("transcripts")
      .select("content")
      .eq("meeting_id", meeting.id)
      .single();
    if (tErr) throw new Error("No transcript found");

    await supabase.from("meetings").update({ status: "analyzing" }).eq("id", meeting.id);

    // Get member names for assignee matching
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id, profiles:user_id(id, display_name, email)")
      .eq("workspace_id", meeting.workspace_id);
    const memberList = (members ?? [])
      .map((m: any) => m.profiles?.display_name || m.profiles?.email)
      .filter(Boolean);

    const prompt = `You are an expert meeting analyst. Extract structured insights from the transcript below.

Today's date is ${todayIso()}. Convert every natural-language time reference ("next Friday", "in two weeks", "end of month", "before the release") into an exact ISO date (YYYY-MM-DD). If a task has no deadline mentioned, set due_date to null.

For action items, identify: (1) the verb/action, (2) the specific task, (3) the responsible person by name. If the transcript names a person from this workspace list, use that exact name: ${memberList.join(", ") || "(no known members)"}. If no owner is clear, set assignee_name to null.

For decisions, capture only FINALIZED conclusions — not open discussion. Provide 1-4 short topic tags per decision.

For risks, look for statements about possible delays, resource shortages, technical challenges, budget concerns, dependency conflicts, or client-related issues. Rate severity.

Summary should be 3-5 concise bullet strings.

MEETING TITLE: ${meeting.title}

TRANSCRIPT:
"""
${transcript.content.slice(0, 60000)}
"""

Return ONLY a JSON object with this exact shape (no prose):
{
  "summary": ["...", "..."],
  "action_items": [{"title": "...", "description": "...", "assignee_name": "..." | null, "due_date": "YYYY-MM-DD" | null, "priority": "low|medium|high"}],
  "decisions": [{"statement": "...", "context": "..." | null, "tags": ["...", "..."]}],
  "risks": [{"description": "...", "category": "delay|resource|technical|budget|dependency|client|other", "severity": "low|medium|high", "mitigation": "..." | null}]
}`;

    let raw: string;
    try {
      raw = await generateJsonCompletion(prompt);
    } catch (error) {
      await supabase
        .from("meetings")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", meeting.id);
      throw error;
    }

    let parsed: Analysis;
    try {
      const stripped = raw.replace(/^```json\s*|\s*```$/g, "").trim();
      parsed = AnalysisSchema.parse(JSON.parse(stripped));
    } catch (e) {
      await supabase
        .from("meetings")
        .update({ status: "failed", error_message: "AI returned invalid JSON" })
        .eq("id", meeting.id);
      throw new Error("AI returned invalid JSON: " + (e instanceof Error ? e.message : "unknown"));
    }

    // Match assignees to workspace members by display_name/email
    const memberByName = new Map<string, string>();
    for (const m of members ?? []) {
      const p = (m as any).profiles;
      if (!p) continue;
      if (p.display_name) memberByName.set(p.display_name.toLowerCase(), p.id);
      if (p.email) memberByName.set(p.email.toLowerCase(), p.id);
      if (p.email) memberByName.set(p.email.split("@")[0].toLowerCase(), p.id);
    }

    // Clear previous extractions for this meeting (idempotent re-run)
    await Promise.all([
      supabase.from("action_items").delete().eq("meeting_id", meeting.id),
      supabase.from("decisions").delete().eq("meeting_id", meeting.id),
      supabase.from("risks").delete().eq("meeting_id", meeting.id),
    ]);

    // Insert
    if (parsed.action_items.length) {
      await supabase.from("action_items").insert(
        parsed.action_items.map((a) => ({
          workspace_id: meeting.workspace_id,
          meeting_id: meeting.id,
          project_id: meeting.project_id,
          title: a.title,
          description: a.description,
          assignee_name: a.assignee_name,
          assignee_id: a.assignee_name
            ? memberByName.get(a.assignee_name.toLowerCase()) ?? null
            : null,
          due_date: a.due_date,
          priority: a.priority,
          status: "todo",
        })),
      );
    }
    if (parsed.risks.length) {
      await supabase.from("risks").insert(
        parsed.risks.map((r) => ({
          workspace_id: meeting.workspace_id,
          meeting_id: meeting.id,
          project_id: meeting.project_id,
          description: r.description,
          category: r.category,
          severity: r.severity,
          mitigation: r.mitigation,
        })),
      );
    }

    // Insert decisions + embeddings (batch embedding call)
    if (parsed.decisions.length) {
      const embedInputs = parsed.decisions.map(
        (d) => `${d.statement} ${d.context ?? ""} ${d.tags.join(" ")}`,
      );
      let embeddings: number[][] = [];
      try {
        embeddings = await embedTexts(embedInputs);
      } catch {
        // Non-fatal — decisions still get stored without embeddings.
      }

      await supabase.from("decisions").insert(
        parsed.decisions.map((d, i) => ({
          workspace_id: meeting.workspace_id,
          meeting_id: meeting.id,
          project_id: meeting.project_id,
          statement: d.statement,
          context: d.context,
          tags: d.tags,
          embedding: embeddings[i] ? (embeddings[i] as any) : null,
        })),
      );
    }

    await supabase
      .from("meetings")
      .update({
        status: "ready",
        summary: parsed.summary.join("\n"),
        error_message: null,
      })
      .eq("id", meeting.id);

    return {
      meetingId: meeting.id,
      counts: {
        action_items: parsed.action_items.length,
        decisions: parsed.decisions.length,
        risks: parsed.risks.length,
      },
    };
  });

// ============ Semantic decision search ============

export const searchDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ query: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const my = await getOrCreateWorkspace(supabase, userId);

    const [embedding] = await embedTexts(data.query);
    if (!embedding) throw new Error("Embedding failed");

    const { data: results, error } = await supabase.rpc("search_decisions", {
      _ws: my.workspace_id,
      _embedding: embedding as any,
      _limit: 12,
    });
    if (error) throw new Error(error.message);
    return results ?? [];
  });
