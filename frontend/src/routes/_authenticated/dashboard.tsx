import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dashboardStats } from "@/lib/tasks.functions";
import { listMeetings } from "@/lib/meetings.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Calendar, ListChecks, AlertTriangle, TrendingUp, Plus, Mic } from "lucide-react";
import { StatusPill } from "@/components/status-pill";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — AI Meeting Operator" }] }),
  component: Dashboard,
});

function Dashboard() {
  const stats = useServerFn(dashboardStats);
  const meetings = useServerFn(listMeetings);
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => stats() });
  const { data: mtgs } = useQuery({ queryKey: ["meetings"], queryFn: () => meetings() });

  const recent = (mtgs ?? []).slice(0, 5);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your workspace at a glance"
        actions={
          <Button asChild>
            <Link to="/meetings/new">
              <Plus className="mr-1 h-4 w-4" /> New meeting
            </Link>
          </Button>
        }
      />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Meetings (7d)" value={data?.meetingsThisWeek ?? 0} icon={<Calendar className="h-4 w-4" />} />
          <StatCard label="Open tasks" value={data?.openTasks ?? 0} icon={<ListChecks className="h-4 w-4" />} />
          <StatCard label="Overdue" value={data?.overdueTasks ?? 0} icon={<TrendingUp className="h-4 w-4" />} tone="warn" />
          <StatCard label="High risks" value={data?.highRisks ?? 0} icon={<AlertTriangle className="h-4 w-4" />} tone="danger" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Recent meetings</h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/meetings">View all</Link>
              </Button>
            </div>
            <div className="mt-4 divide-y divide-border">
              {recent.length === 0 ? (
                <EmptyMeetings />
              ) : (
                recent.map((m: any) => (
                  <Link
                    key={m.id}
                    to="/meetings/$meetingId"
                    params={{ meetingId: m.id }}
                    className="flex items-center justify-between gap-4 py-3 transition hover:bg-secondary/50"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {m.projects?.name ? `${m.projects.name} · ` : ""}
                        {formatDistanceToNow(new Date(m.created_at))} ago
                      </div>
                    </div>
                    <StatusPill status={m.status} />
                  </Link>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold">Recent decisions</h2>
            <div className="mt-4 space-y-3">
              {(data?.recentDecisions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Decisions extracted from your meetings appear here.
                </p>
              ) : (
                data!.recentDecisions.map((d: any) => (
                  <div key={d.id} className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium leading-snug">{d.statement}</p>
                    {d.meetings?.title && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        from {d.meetings.title}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "warn" | "danger";
}) {
  const toneClass =
    tone === "danger" ? "text-destructive" : tone === "warn" ? "text-amber-600" : "text-primary";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        <span className={toneClass}>{icon}</span>
      </div>
      <div className={"mt-3 font-display text-3xl font-semibold " + toneClass}>{value}</div>
    </Card>
  );
}

function EmptyMeetings() {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Mic className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-display font-semibold">No meetings yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Record your first meeting or upload an audio file to get started.
      </p>
      <Button asChild className="mt-4">
        <Link to="/meetings/new">
          <Plus className="mr-1 h-4 w-4" /> New meeting
        </Link>
      </Button>
    </div>
  );
}