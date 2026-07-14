import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentWorkspace, listMembers } from "@/lib/workspace.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — AI Meeting Operator" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const wsFn = useServerFn(getCurrentWorkspace);
  const memFn = useServerFn(listMembers);
  const { data: ws } = useQuery({ queryKey: ["workspace"], queryFn: () => wsFn() });
  const { data: members } = useQuery({ queryKey: ["members"], queryFn: () => memFn() });

  return (
    <>
      <PageHeader title="Settings" description="Your workspace and team" />
      <PageBody>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold">Workspace</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{ws?.workspace.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Your role</dt>
                <dd className="font-medium capitalize">{ws?.role ?? "—"}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold">
              Members ({members?.length ?? 0})
            </h2>
            <div className="mt-4 space-y-2">
              {(members ?? []).map((m: any) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-md border border-border p-3"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                      {(m.profiles?.display_name ?? m.profiles?.email ?? "?")
                        .slice(0, 2)
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.profiles?.display_name ?? m.profiles?.email}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.profiles?.email}
                    </div>
                  </div>
                  <span className="rounded bg-secondary px-2 py-0.5 text-xs capitalize text-muted-foreground">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Team invites are coming soon. For now, your workspace is set up for solo use
              with room to grow.
            </p>
          </Card>
        </div>
      </PageBody>
    </>
  );
}