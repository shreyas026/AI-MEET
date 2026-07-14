import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMeeting, deleteMeeting } from "@/lib/meetings.functions";
import { transcribeMeeting, analyzeMeeting } from "@/lib/ai.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill, PriorityPill, SeverityPill } from "@/components/status-pill";
import { ArrowLeft, RefreshCw, Trash2, Sparkles, Calendar as CalIcon } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/meetings/$meetingId")({
  head: () => ({ meta: [{ title: "Meeting — AI Meeting Operator" }] }),
  component: MeetingDetail,
});

function MeetingDetail() {
  const { meetingId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getMeeting);
  const transcribeFn = useServerFn(transcribeMeeting);
  const analyzeFn = useServerFn(analyzeMeeting);
  const delFn = useServerFn(deleteMeeting);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["meeting", meetingId],
    queryFn: () => getFn({ data: { id: meetingId } }),
  });

  async function reanalyze() {
    try {
      toast.info("Re-analyzing meeting…");
      if (data?.meeting.status === "failed" && data?.audioUrl) {
        await transcribeFn({ data: { meetingId } });
      }
      await analyzeFn({ data: { meetingId } });
      toast.success("Meeting analyzed!");
      qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this meeting and all extracted data?")) return;
    await delFn({ data: { id: meetingId } });
    toast.success("Meeting deleted");
    navigate({ to: "/meetings" });
  }

  if (isLoading) {
    return (
      <PageBody>
        <Card className="h-64 animate-pulse bg-secondary/40" />
      </PageBody>
    );
  }
  if (!data) return null;

  const { meeting, transcript, actionItems, decisions, risks, audioUrl } = data;
  const summaryBullets = meeting.summary?.split("\n").filter(Boolean) ?? [];

  return (
    <>
      <PageHeader
        title={meeting.title}
        description={
          <>
            {meeting.projects?.name && (
              <span className="mr-2 rounded bg-secondary px-1.5 py-0.5">
                {meeting.projects.name}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalIcon className="h-3.5 w-3.5" />
              {format(new Date(meeting.scheduled_at ?? meeting.created_at), "PPP")}
            </span>
            {meeting.duration_seconds ? (
              <span> · {Math.round(meeting.duration_seconds / 60)} min</span>
            ) : null}
          </>
        }
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/meetings">
                <ArrowLeft className="mr-1 h-4 w-4" /> All meetings
              </Link>
            </Button>
            {meeting.status === "ready" || meeting.status === "failed" ? (
              <Button variant="outline" size="sm" onClick={reanalyze}>
                <RefreshCw className="mr-1 h-4 w-4" /> Re-analyze
              </Button>
            ) : null}
            <StatusPill status={meeting.status} />
            <Button variant="ghost" size="icon" onClick={handleDelete} title="Delete">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </>
        }
      />
      <PageBody>
        {meeting.status === "failed" && (
          <Card className="mb-6 border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">Analysis failed</p>
            <p className="mt-1 text-xs text-destructive/80">
              {meeting.error_message ?? "Unknown error"}
            </p>
          </Card>
        )}

        {audioUrl && (
          <Card className="mb-6 p-4">
            <audio controls src={audioUrl} className="w-full" />
          </Card>
        )}

        {summaryBullets.length > 0 && (
          <Card className="mb-6 p-6">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <h3 className="font-display font-semibold">Summary</h3>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {summaryBullets.map((b, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span>{b.replace(/^[-•*]\s*/, "")}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Tabs defaultValue="actions">
          <TabsList>
            <TabsTrigger value="actions">
              Action items{" "}
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-xs text-primary">
                {actionItems.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="decisions">
              Decisions{" "}
              <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 text-xs text-emerald-700">
                {decisions.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="risks">
              Risks{" "}
              <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs text-amber-700">
                {risks.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
          </TabsList>

          <TabsContent value="actions" className="mt-4 space-y-3">
            {actionItems.length === 0 ? (
              <Empty text="No action items extracted from this meeting." />
            ) : (
              actionItems.map((a: any) => (
                <Card key={a.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{a.title}</p>
                        <PriorityPill priority={a.priority} />
                      </div>
                      {a.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {a.assignee_name && <div>👤 {a.assignee_name}</div>}
                      {a.due_date && (
                        <div>Due {format(new Date(a.due_date), "MMM d")}</div>
                      )}
                    </div>
                  </div>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="decisions" className="mt-4 space-y-3">
            {decisions.length === 0 ? (
              <Empty text="No decisions were finalized in this meeting." />
            ) : (
              decisions.map((d: any) => (
                <Card key={d.id} className="p-4">
                  <p className="font-medium">{d.statement}</p>
                  {d.context && (
                    <p className="mt-1 text-sm text-muted-foreground">{d.context}</p>
                  )}
                  {d.tags?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.tags.map((t: string) => (
                        <span
                          key={t}
                          className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="risks" className="mt-4 space-y-3">
            {risks.length === 0 ? (
              <Empty text="No risks were identified in this meeting." />
            ) : (
              risks.map((r: any) => (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 font-medium">{r.description}</p>
                    <div className="flex flex-shrink-0 gap-1.5">
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {r.category}
                      </span>
                      <SeverityPill severity={r.severity} />
                    </div>
                  </div>
                  {r.mitigation && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">Mitigation:</span>{" "}
                      {r.mitigation}
                    </p>
                  )}
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="transcript" className="mt-4">
            <Card className="p-6">
              {transcript ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {transcript}
                </div>
              ) : (
                <Empty text="Transcript not available yet." />
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>
  );
}