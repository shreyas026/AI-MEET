import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMeetings } from "@/lib/meetings.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Mic } from "lucide-react";
import { StatusPill } from "@/components/status-pill";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/meetings")({
  head: () => ({ meta: [{ title: "Meetings — AI Meeting Operator" }] }),
  component: MeetingsLayout,
});

function MeetingsLayout() {
  const matches = useMatches();
  const hasChild = matches.some((m) => m.routeId !== "/_authenticated/meetings" && m.routeId.startsWith("/_authenticated/meetings"));
  if (hasChild) return <Outlet />;
  return <MeetingsList />;
}

function MeetingsList() {
  const listFn = useServerFn(listMeetings);
  const { data, isLoading } = useQuery({ queryKey: ["meetings"], queryFn: () => listFn() });

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Every recorded meeting and its extracted work"
        actions={
          <Button asChild>
            <Link to="/meetings/new">
              <Plus className="mr-1 h-4 w-4" /> New meeting
            </Link>
          </Button>
        }
      />
      <PageBody>
        {isLoading ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="h-20 animate-pulse bg-secondary/40" />
            ))}
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <Card className="p-16 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Mic className="h-6 w-6" />
            </div>
            <h3 className="mt-6 font-display text-xl font-semibold">No meetings yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Create your first meeting and upload or record the audio. AI Meeting Operator will
              transcribe it and extract every action item, decision, and risk.
            </p>
            <Button asChild className="mt-6">
              <Link to="/meetings/new">
                <Plus className="mr-1 h-4 w-4" /> New meeting
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {data!.map((m: any) => (
              <Link
                key={m.id}
                to="/meetings/$meetingId"
                params={{ meetingId: m.id }}
                className="flex items-center justify-between gap-4 p-4 transition hover:bg-secondary/50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {m.projects?.name ? (
                      <>
                        <span className="rounded bg-secondary px-1.5 py-0.5">
                          {m.projects.name}
                        </span>
                        <span className="mx-2">·</span>
                      </>
                    ) : null}
                    {formatDistanceToNow(new Date(m.created_at))} ago
                    {m.duration_seconds
                      ? ` · ${Math.round(m.duration_seconds / 60)} min`
                      : ""}
                  </div>
                </div>
                <StatusPill status={m.status} />
              </Link>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}