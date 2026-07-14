import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getOrCreateWorkspace } from "@/lib/workspace.functions";

async function getWsId(supabase: any, userId: string): Promise<string> {
  const { workspace_id } = await getOrCreateWorkspace(supabase, userId);
  return workspace_id;
}

export const listMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);
    const { data, error } = await supabase
      .from("meetings")
      .select("*, projects(id, name, color, department)")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMeeting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: meeting, error } = await supabase
      .from("meetings")
      .select("*, projects(id, name, color, department)")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);

    const [transcriptRes, actionItemsRes, decisionsRes, risksRes] = await Promise.all([
      supabase.from("transcripts").select("content").eq("meeting_id", data.id).maybeSingle(),
      supabase
        .from("action_items")
        .select("*")
        .eq("meeting_id", data.id)
        .order("created_at"),
      supabase.from("decisions").select("*").eq("meeting_id", data.id).order("created_at"),
      supabase.from("risks").select("*").eq("meeting_id", data.id).order("severity"),
    ]);

    let audioUrl: string | null = null;
    if (meeting.audio_path) {
      const { data: signed } = await supabase.storage
        .from("meeting-audio")
        .createSignedUrl(meeting.audio_path, 3600);
      audioUrl = signed?.signedUrl ?? null;
    }

    return {
      meeting,
      transcript: transcriptRes.data?.content ?? null,
      actionItems: actionItemsRes.data ?? [],
      decisions: decisionsRes.data ?? [],
      risks: risksRes.data ?? [],
      audioUrl,
    };
  });

const createSchema = z.object({
  title: z.string().min(1).max(200),
  project_id: z.string().uuid().nullable().optional(),
  scheduled_at: z.string().nullable().optional(),
});

export const createMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);
    const { data: meeting, error } = await supabase
      .from("meetings")
      .insert({
        workspace_id: ws,
        title: data.title,
        project_id: data.project_id ?? null,
        scheduled_at: data.scheduled_at ?? new Date().toISOString(),
        created_by: userId,
        status: "draft",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return meeting;
  });

export const deleteMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Best-effort: remove audio from storage
    const { data: m } = await context.supabase
      .from("meetings")
      .select("audio_path")
      .eq("id", data.id)
      .maybeSingle();
    if (m?.audio_path) {
      await context.supabase.storage.from("meeting-audio").remove([m.audio_path]);
    }
    const { error } = await context.supabase.from("meetings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Update meeting metadata after upload
export const setMeetingAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        audio_path: z.string(),
        duration_seconds: z.number().int().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meetings")
      .update({
        audio_path: data.audio_path,
        duration_seconds: data.duration_seconds ?? null,
        status: "transcribing",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });