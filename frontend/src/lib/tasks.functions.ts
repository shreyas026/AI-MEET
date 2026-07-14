import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getOrCreateWorkspace } from "@/lib/workspace.functions";

async function getWsId(supabase: any, userId: string): Promise<string> {
  const { workspace_id } = await getOrCreateWorkspace(supabase, userId);
  return workspace_id;
}

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);
    const { data, error } = await supabase
      .from("action_items")
      .select(
        "*, projects(id, name, color), meetings(id, title), profiles:assignee_id(id, display_name, email, avatar_url)",
      )
      .eq("workspace_id", ws)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        status: z.enum(["todo", "in_progress", "done"]).optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        due_date: z.string().nullable().optional(),
        assignee_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("action_items").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("action_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        project_id: z.string().uuid().nullable().optional(),
        due_date: z.string().nullable().optional(),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        assignee_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);
    const { data: t, error } = await supabase
      .from("action_items")
      .insert({
        workspace_id: ws,
        title: data.title,
        description: data.description,
        project_id: data.project_id,
        due_date: data.due_date,
        priority: data.priority,
        assignee_id: data.assignee_id,
        created_by: userId,
        status: "todo",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return t;
  });

export const listRisks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);
    const { data, error } = await supabase
      .from("risks")
      .select("*, projects(id, name, color), meetings(id, title)")
      .eq("workspace_id", ws)
      .order("severity", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);
    const { data, error } = await supabase
      .from("decisions")
      .select("id, statement, context, tags, meeting_id, project_id, created_at, projects(id, name, color), meetings(id, title)")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const dashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const today = new Date().toISOString().slice(0, 10);
    const [meetingsRes, openTasksRes, overdueRes, risksRes, decisionsRes] = await Promise.all([
      supabase
        .from("meetings")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws)
        .gte("created_at", since),
      supabase
        .from("action_items")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws)
        .neq("status", "done"),
      supabase
        .from("action_items")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws)
        .neq("status", "done")
        .lt("due_date", today),
      supabase
        .from("risks")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", ws)
        .eq("severity", "high"),
      supabase
        .from("decisions")
        .select("id, statement, created_at, meetings(id, title)")
        .eq("workspace_id", ws)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    return {
      meetingsThisWeek: meetingsRes.count ?? 0,
      openTasks: openTasksRes.count ?? 0,
      overdueTasks: overdueRes.count ?? 0,
      highRisks: risksRes.count ?? 0,
      recentDecisions: decisionsRes.data ?? [],
    };
  });