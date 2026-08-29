import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMeeting, deleteMeeting } from "@/lib/meetings.functions";
import { transcribeMeeting, analyzeMeeting } from "@/lib/ai.functions";
import { updateSegment, segmentMeeting, askMeeting } from "@/lib/transcripts.functions";
import { emailMeetingDetails } from "@/lib/email.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill, PriorityPill, SeverityPill } from "@/components/status-pill";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Sparkles,
  Calendar as CalIcon,
  Play,
  Pencil,
  Check,
  X,
  MessageCircle,
  Send,
  Volume2,
  ScanLine,
  Pause,
  Mail,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/meetings/$meetingId")({
  head: () => ({ meta: [{ title: "Meeting — AI Meeting Operator" }] }),
  component: MeetingDetail,
});

function fmtTime(s: number | null | undefined): string {
  if (s == null) return "0:00";
  const secs = Math.floor(s);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function MeetingDetail() {
  const { meetingId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getMeeting);
  const transcribeFn = useServerFn(transcribeMeeting);
  const analyzeFn = useServerFn(analyzeMeeting);
  const delFn = useServerFn(deleteMeeting);
  const updateFn = useServerFn(updateSegment);
  const segmentFn = useServerFn(segmentMeeting);
  const askFn = useServerFn(askMeeting);
  const emailFn = useServerFn(emailMeetingDetails);
  const [emailing, setEmailing] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editSpeaker, setEditSpeaker] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [segmenting, setSegmenting] = useState(false);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);

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

  async function runSegmentation() {
    setSegmenting(true);
    try {
      await segmentFn({ data: { meetingId } });
      toast.success("Transcript segmented with speaker labels");
      qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Segmentation failed");
    } finally {
      setSegmenting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this meeting and all extracted data?")) return;
    await delFn({ data: { id: meetingId } });
    toast.success("Meeting deleted");
    navigate({ to: "/meetings" });
  }

  async function sendEmail() {
    setEmailing(true);
    try {
      const res = await emailFn({
        data: { meetingId, baseUrl: import.meta.env.VITE_APP_URL || window.location.origin },
      });
      toast.success(`Meeting notes emailed to ${res.to}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not email the notes");
    } finally {
      setEmailing(false);
    }
  }

  function seekTo(seconds: number) {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seconds;
      audio.play().catch(() => {});
      setActiveSegment(null);
    }
  }

  function startEdit(seg: any) {
    setEditingId(seg.id);
    setEditContent(seg.content);
    setEditSpeaker(seg.speaker ?? "");
  }

  async function saveEdit(seg: any) {
    try {
      await updateFn({
        data: {
          id: seg.id,
          content: editContent.trim() || seg.content,
          speaker: editSpeaker.trim() ? editSpeaker.trim() : null,
        },
      });
      toast.success("Segment updated");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["meeting", meetingId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function sendChat() {
    const q = chatInput.trim();
    if (!q || chatBusy) return;
    setChatInput("");
    setChatMsgs((m) => [...m, { role: "user", text: q }]);
    setChatBusy(true);
    try {
      const res = await askFn({ data: { meetingId, question: q } });
      setChatMsgs((m) => [...m, { role: "assistant", text: res.answer }]);
    } catch (e) {
      setChatMsgs((m) => [
        ...m,
        { role: "assistant", text: e instanceof Error ? e.message : "Could not answer" },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      const segments = data?.segments ?? [];
      if (!segments.length) return;
      const t = audio.currentTime;
      const active = segments.find(
        (s: any) => s.start_seconds <= t && t <= (s.end_seconds ?? s.start_seconds + 5),
      );
      setActiveSegment(active?.id ?? null);
    };
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [data?.segments]);

  if (isLoading) {
    return (
      <PageBody>
        <Card className="h-64 animate-pulse bg-secondary/40" />
      </PageBody>
    );
  }
  if (!data) return null;

  const { meeting, transcript, actionItems, decisions, risks, segments, audioUrl } = data;
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
            <Button variant="outline" size="sm" onClick={runSegmentation} disabled={segmenting}>
              <ScanLine className="mr-1 h-4 w-4" />
              {segmenting ? "Segmenting…" : "Speaker labels"}
            </Button>
            <Button variant="outline" size="sm" onClick={sendEmail} disabled={emailing}>
              <Mail className="mr-1 h-4 w-4" />
              {emailing ? "Emailing…" : "Email me the notes"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setChatOpen((v) => !v)}
              title="Ask about this meeting"
            >
              <MessageCircle className="mr-1 h-4 w-4" /> Ask AI
            </Button>
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
            <audio ref={audioRef} controls src={audioUrl} className="w-full" />
          </Card>
        )}

        {chatOpen && (
          <Card className="mb-6 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display font-semibold">
                <MessageCircle className="h-4 w-4 text-primary" /> Ask about this meeting
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setChatOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {chatMsgs.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  e.g. "What was decided about the launch date?" or "What risks were mentioned?"
                </p>
              )}
              {chatMsgs.map((m, i) => (
                <div
                  key={i}
                  className={
                    "rounded-lg px-3 py-2 text-sm " +
                    (m.role === "user"
                      ? "ml-8 bg-primary/10 text-foreground"
                      : "mr-8 bg-secondary/60 text-foreground/90")
                  }
                >
                  {m.text}
                </div>
              ))}
              {chatBusy && (
                <div className="mr-8 inline-block rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                  Thinking…
                </div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="Ask about this meeting…"
                disabled={chatBusy}
              />
              <Button onClick={sendChat} disabled={chatBusy || !chatInput.trim()}>
                <Send className="mr-1 h-4 w-4" /> Ask
              </Button>
            </div>
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
          <TabsList className="flex-wrap">
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
            <TabsTrigger value="transcript">
              Transcript{" "}
              {segments.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-secondary px-1.5 text-xs text-muted-foreground">
                  {segments.length}
                </span>
              ) : null}
            </TabsTrigger>
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
                      {a.due_date && <div>Due {format(new Date(a.due_date), "MMM d")}</div>}
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
                  {d.context && <p className="mt-1 text-sm text-muted-foreground">{d.context}</p>}
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
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-display font-semibold">
                  <Volume2 className="h-4 w-4 text-primary" />
                  {segments.length > 0 ? "Timestamped transcript" : "Transcript"}
                </h3>
                {segments.length > 0 && audioUrl && (
                  <span className="text-xs text-muted-foreground">
                    Click a segment to play from that time
                  </span>
                )}
              </div>

              {segments.length > 0 ? (
                <div className="space-y-2.5">
                  {segments.map((seg: any) => {
                    const isEditing = editingId === seg.id;
                    const isActive = activeSegment === seg.id;
                    return (
                      <div
                        key={seg.id}
                        className={
                          "group rounded-lg border p-3 transition " +
                          (isActive ? "border-primary/50 bg-primary/5" : "border-border")
                        }
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                value={editSpeaker}
                                onChange={(e) => setEditSpeaker(e.target.value)}
                                placeholder="Speaker name"
                                className="max-w-[220px]"
                              />
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => saveEdit(seg)}>
                                  <Check className="mr-1 h-3.5 w-3.5" /> Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            <Textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={3}
                            />
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => seekTo(seg.start_seconds ?? 0)}
                              className="mt-0.5 flex h-6 flex-shrink-0 items-center gap-1 rounded bg-secondary px-1.5 text-xs font-medium text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
                              title="Play from here"
                            >
                              <Play className="h-3 w-3" />
                              {fmtTime(seg.start_seconds)}
                            </button>
                            <div className="min-w-0 flex-1">
                              {seg.speaker && (
                                <div className="mb-0.5 flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                                    <Pause className="h-3 w-3" />
                                    {seg.speaker}
                                  </span>
                                </div>
                              )}
                              <p className="text-sm leading-relaxed text-foreground/90">
                                {seg.content}
                              </p>
                            </div>
                            <button
                              onClick={() => startEdit(seg)}
                              className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded opacity-0 transition group-hover:opacity-100 hover:bg-secondary"
                              title="Edit segment"
                            >
                              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : transcript ? (
                <>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {transcript}
                  </div>
                  {!meeting.status.includes("failed") && !meeting.status.includes("transcrib") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={runSegmentation}
                      disabled={segmenting}
                    >
                      <ScanLine className="mr-1 h-4 w-4" />
                      {segmenting ? "Segmenting…" : "Add speaker labels & timestamps"}
                    </Button>
                  )}
                </>
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
  return <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
}
