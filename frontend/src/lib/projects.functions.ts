import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getOrCreateWorkspace } from "@/lib/workspace.functions";

async function getWsId(supabase: any, userId: string): Promise<string> {
  const { workspace_id } = await getOrCreateWorkspace(supabase, userId);
  return workspace_id;
}

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const createSchema = z.object({
  name: z.string().min(1).max(120),
  department: z.string().max(80).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ws = await getWsId(supabase, userId);
    const { data: proj, error } = await supabase
      .from("projects")
      .insert({
        workspace_id: ws,
        name: data.name,
        department: data.department ?? null,
        color: data.color ?? null,
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return proj;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });