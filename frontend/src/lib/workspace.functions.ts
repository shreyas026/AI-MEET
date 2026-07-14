import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export async function getOrCreateWorkspace(
  supabase: any,
  userId: string,
): Promise<{ workspace_id: string; role: string }> {
  // Try to find existing membership
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (data?.workspace_id) return data;

  // No workspace — user signed up before the trigger existed.
  // Auto-provision one now using the service-role client to bypass RLS.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Get user email for workspace name
  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userData?.user?.email ?? "user";
  const name = `${email.split("@")[0]}'s workspace`;

  const { data: ws, error: wsErr } = await supabaseAdmin
    .from("workspaces")
    .insert({ name, created_by: userId })
    .select("id")
    .single();
  if (wsErr) throw new Error(wsErr.message);

  // Upsert profile
  await supabaseAdmin.from("profiles").upsert(
    {
      id: userId,
      email,
      display_name: userData?.user?.user_metadata?.full_name ?? email.split("@")[0],
      avatar_url: userData?.user?.user_metadata?.avatar_url ?? null,
    },
    { onConflict: "id" },
  );

  await supabaseAdmin
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: userId, role: "admin" });

  return { workspace_id: ws.id, role: "admin" };
}

export const getCurrentWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { workspace_id, role } = await getOrCreateWorkspace(supabase, userId);

    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, created_at")
      .eq("id", workspace_id)
      .single();
    if (error) throw new Error(error.message);

    return { workspace: data, role };
  });

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: my } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!my) return [];
    const { data, error } = await supabase
      .from("workspace_members")
      .select("id, role, user_id, profiles:user_id(id, display_name, email, avatar_url)")
      .eq("workspace_id", my.workspace_id);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
