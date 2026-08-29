import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getOrCreateWorkspace } from "@/lib/workspace.functions";
import {
  createLiveAuthToken,
  embedTexts,
  generateJsonCompletion,
  generateTextCompletion,
  getLiveModel,
} from "@/lib/gemini.server";
import { chunkText, rebuildChunks } from "@/lib/transcript-chunks.server";

async function getWsId(supabase: any, userId: string): Promise<string> {
  const { workspace_id } = await getOrCreateWorkspace(supabase, userId);
  return workspace_id;
}

// ============ Live transcription ============

// Mint a short-lived ephemeral token so the browser can open a WebSocket
// straight to Gemini Live API (captions stream in real time) without the API key.
export const getLiveToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { token, expireTime } = await createLiveAuthToken();
    return { token, expireTime, model: getLiveModel() };
  });

const segmentSchema = z.object({
  seq: z.number().int().min(0),
  start_seconds: z.number(),
  end_seconds: z.number(),
  speaker: z.string().nullable().optional(),
  content: z.string(),
});

// Persist a live-session transcript and its timestamped segments.
export const saveLiveTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        meetingId: z.string().uuid(),
        transcript: z.string().min(1),
        segments: z.array(segmentSchema),
        duration_seconds: z.number().int().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, workspace_id, status")
      .eq("id", data.meetingId)
      .single();
    if (!meeting) throw new Error("Meeting not found");

    const patch: any = { status: "ready" };
    if (data.duration_seconds) patch.duration_seconds = data.duration_seconds;

    const { error: mErr } = await supabase.from("meetings").update(patch).eq("id", data.meetingId);
    if (mErr) throw new Error(mErr.message);

    await supabase
      .from("transcripts")
      .upsert(
        {
          meeting_id: data.meetingId,
          workspace_id: meeting.workspace_id,
          content: data.transcript,
        },
        { onConflict: "meeting_id" },
      );

    // Replace segments idempotently
    await supabase.from("transcript_segments").delete().eq("meeting_id", data.meetingId);
    if (data.segments.length) {
      const { error: sErr } = await supabase.from("transcript_segments").insert(
        data.segments.map((s) => ({
          meeting_id: data.meetingId,
          workspace_id: meeting.workspace_id,
          seq: s.seq,
          start_seconds: s.start_seconds,
          end_seconds: s.end_seconds,
          speaker: s.speaker ?? null,
          content: s.content,
          is_live: true,
        })),
      );
      if (sErr) throw new Error(sErr.message);
    }

    await rebuildChunks(supabase, data.meetingId, meeting.workspace_id, data.transcript);

    return { ok: true };
  });

// ============ Transcript segments ============

export const listSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: segments, error } = await supabase
      .from("transcript_segments")
      .select("*")
      .eq("meeting_id", data.meetingId)
      .order("seq", { ascending: true });
    if (error) throw new Error(error.message);
    return segments ?? [];
  });

export const updateSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        content: z.string().min(1).optional(),
        speaker: z.string().nullable().optional(),
        start_seconds: z.number().optional(),
        end_seconds: z.number().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("transcript_segments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSegments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("transcript_segments")
      .delete()
      .eq("meeting_id", data.meetingId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Speaker diarization for uploaded recordings ============

// Splits a raw transcript into speaker-labeled, timestamped segments by asking
// Gemini to segment the text into turns, then distributing timestamps across
// the audio duration proportional to each segment's length.
export const segmentMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, workspace_id, title, duration_seconds")
      .eq("id", data.meetingId)
      .single();
    if (!meeting) throw new Error("Meeting not found");

    const { data: transcriptRow } = await supabase
      .from("transcripts")
      .select("content")
      .eq("meeting_id", data.meetingId)
      .maybeSingle();
    const transcript = transcriptRow?.content;
    if (!transcript) throw new Error("No transcript yet for this meeting");

    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id, profiles:user_id(id, display_name, email)")
      .eq("workspace_id", meeting.workspace_id);
    const knownNames = (members ?? [])
      .map((m: any) => m.profiles?.display_name || m.profiles?.email?.split("@")[0])
      .filter(Boolean)
      .slice(0, 12);

    const prompt = `You are a meeting transcription expert. Below is a raw meeting transcript.

Break the transcript into natural speaker turns. Label each turn with a speaker.
- If a turn clearly refers to one of these known participants, use that exact name: ${knownNames.join(", ") || "(none)"}.
- Otherwise label as "Speaker 1", "Speaker 2", etc., keeping the same label for the same apparent person across turns.
- Do not invent content. Keep the wording verbatim, but fix obvious transcription artifacts like "um", "uh", and duplicated words.

MEETING TITLE: ${meeting.title}

TRANSCRIPT:
"""
${transcript.slice(0, 60000)}
"""

Return ONLY a JSON object:
{
  "segments": [{"speaker": "...", "content": "..."}, ...]
}`;

    const raw = await generateJsonCompletion(prompt);
    const stripped = raw.replace(/^```json\s*|\s*```$/g, "").trim();
    let segments: Array<{ speaker: string | null; content: string }> = [];
    try {
      const parsed = JSON.parse(stripped);
      segments = (Array.isArray(parsed) ? parsed : (parsed.segments ?? [])).map((s: any) => ({
        speaker: s.speaker ?? null,
        content: String(s.content ?? "").trim(),
      }));
    } catch {
      throw new Error("AI returned invalid segments");
    }
    segments = segments.filter((s) => s.content.length > 0);
    if (!segments.length) throw new Error("No segments produced");

    // Distribute timestamps proportional to character length across duration.
    const totalDuration = Math.max(meeting.duration_seconds ?? 60, 10);
    const totalChars = segments.reduce((sum, s) => sum + s.content.length, 0);
    let cursor = 0;
    const rows = segments.map((s, i) => {
      const dur = (s.content.length / totalChars) * totalDuration;
      const start = cursor;
      const end = Math.min(start + dur, totalDuration);
      cursor = end;
      return {
        meeting_id: data.meetingId,
        workspace_id: meeting.workspace_id,
        seq: i,
        start_seconds: Number(start.toFixed(2)),
        end_seconds: Number(end.toFixed(2)),
        speaker: s.speaker,
        content: s.content,
        is_live: false,
      };
    });

    await supabase.from("transcript_segments").delete().eq("meeting_id", data.meetingId);
    const { error: insErr } = await supabase.from("transcript_segments").insert(rows);
    if (insErr) throw new Error(insErr.message);

    await rebuildChunks(supabase, data.meetingId, meeting.workspace_id, transcript);

    return { count: rows.length };
  });

// ============ "Ask about this meeting" (RAG over transcript chunks) ============

export const askMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ meetingId: z.string().uuid(), question: z.string().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, workspace_id, title")
      .eq("id", data.meetingId)
      .single();
    if (!meeting) throw new Error("Meeting not found");

    const { data: transcriptRow } = await supabase
      .from("transcripts")
      .select("content")
      .eq("meeting_id", data.meetingId)
      .maybeSingle();
    const transcript = transcriptRow?.content;
    if (!transcript) throw new Error("No transcript yet for this meeting");

    // Retrieve the most relevant chunks (semantic when possible, else fall back to all chunks).
    let contextChunks: string[] = [];
    try {
      const [embedding] = await embedTexts(data.question);
      if (embedding) {
        const { data: matches } = await supabase.rpc("search_transcript_chunks", {
          _meeting: data.meetingId,
          _ws: meeting.workspace_id,
          _embedding: embedding as any,
          _limit: 6,
        });
        if (matches?.length) {
          contextChunks = (matches as any[]).map((m) => m.content);
        }
      }
    } catch {
      // ignore
    }
    if (!contextChunks.length) {
      const chunks = chunkText(transcript);
      const total = Math.min(chunks.length, 6);
      contextChunks = chunks.slice(0, total);
      // Basic keyword ranking fallback
      const q = data.question
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      if (q.length) {
        const scored = chunks
          .map((c) => ({
            c,
            score: q.reduce((s, w) => s + (c.toLowerCase().includes(w) ? 1 : 0), 0),
          }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score);
        if (scored.length) contextChunks = scored.slice(0, 6).map((x) => x.c);
      }
    }

    const prompt = `You are an assistant that answers questions strictly from a meeting transcript.
Meeting title: "${meeting.title}"

Transcript excerpts:
${contextChunks.map((c, i) => `[Excerpt ${i + 1}]\n${c}`).join("\n\n")}

Question: ${data.question}

Answer clearly and cite which excerpt(s) your answer came from. If the answer is not in the excerpts, say you couldn't find it in this meeting.`;

    const answer = await generateJsonCompletion(prompt);
    const stripped = answer.replace(/^```json\s*|\s*```$/g, "").trim();
    try {
      const parsed = JSON.parse(stripped);
      const text = parsed.answer || parsed.text || JSON.stringify(parsed);
      return { answer: typeof text === "string" ? text : String(text) };
    } catch {
      return { answer: answer.replace(/^"|"$/g, "") };
    }
  });

// ============ Workspace-wide search ============

export const searchAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ query: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);

    const [transcripts, workspace] = await Promise.all([
      supabase.rpc("search_transcripts", { _ws: ws, _q: data.query, _limit: 10 }),
      supabase.rpc("search_workspace_content", { _ws: ws, _q: data.query, _limit: 15 }),
    ]);

    return {
      transcripts: transcripts.data ?? [],
      workspace: workspace.data ?? [],
    };
  });

// ============ Live meeting room Q&A ============

// Answers a participant's question mid-meeting using the transcript-so-far as
// context (works before the meeting is saved to the database).
export const askLiveRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        transcript: z.string().max(120000),
        question: z.string().max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const context = data.transcript.slice(-20000) || "(no transcript yet)";
    const prompt = `You are the AI assistant inside a live meeting. Answer the participant's question concisely based only on what has been said so far in this meeting.

LIVE TRANSCRIPT SO FAR:
"""
${context}
"""

QUESTION: ${data.question}

Answer directly. If the transcript doesn't yet contain the answer, say so clearly and suggest what to watch for.`;

    const answer = await generateTextCompletion(prompt);
    return { answer };
  });
