import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { startBot, stopBot, getBotStatus } from "@/lib/bot.functions";
import { PageBody, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bot,
  Mic,
  MicOff,
  Square,
  Loader2,
  Radio,
  ArrowLeft,
  Users,
  Video,
  VideoOff,
  CheckCircle2,
  Sparkles,
  Globe,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/meetings/bot")({
  head: () => ({ meta: [{ title: "AI Meeting Bot — AI Meeting Operator" }] }),
  component: MeetingBot,
});

type BotStatus = "idle" | "joining" | "connected" | "recording" | "ending" | "ended" | "error";

interface Participant {
  id: string;
  name: string;
  isBot: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
}

interface Segment {
  seq: number;
  start_seconds: number;
  end_seconds: number;
  speaker: string | null;
  content: string;
}

function MeetingBot() {
  const startBotFn = useServerFn(startBot);
  const stopBotFn = useServerFn(stopBot);
  const getBotStatusFn = useServerFn(getBotStatus);

  const [platform, setPlatform] = useState<string>("google-meet");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [status, setStatus] = useState<BotStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [liveText, setLiveText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentsEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    segmentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [segments]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function detectPlatform(url: string): string {
    if (url.includes("meet.google.com")) return "google-meet";
    if (url.includes("zoom.us")) return "zoom";
    if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return "teams";
    return platform;
  }

  function handleUrlChange(url: string) {
    setMeetingUrl(url);
    if (url.startsWith("http")) {
      setPlatform(detectPlatform(url));
    }
  }

  async function handleStart() {
    if (!meetingUrl.trim()) return toast.error("Please enter a meeting link");
    if (!meetingTitle.trim()) return toast.error("Please enter a meeting title");

    setStatus("joining");
    setError(null);
    setSegments([]);
    setElapsed(0);

    try {
      const res = await startBotFn({
        data: {
          platform: platform as any,
          meetingUrl: meetingUrl.trim(),
          meetingTitle: meetingTitle.trim(),
        },
      });
      setSessionId(res.sessionId);
      setStatus("recording");

      // Start elapsed timer
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

      // Poll for updates
      pollRef.current = setInterval(async () => {
        try {
          const session = await getBotStatusFn({ data: { sessionId: res.sessionId } });
          if (session) {
            setParticipants(session.participants);
            setSegments(session.segments);
            if (session.status === "ended" || session.status === "error") {
              handleEnd();
            }
          }
        } catch {
          // Session may have ended
        }
      }, 2000);

      toast.success("Bot joined the meeting!");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to join meeting");
      toast.error(err instanceof Error ? err.message : "Failed to join meeting");
    }
  }

  async function handleEnd() {
    if (!sessionId) return;
    setStatus("ending");

    if (timerRef.current) clearInterval(timerRef.current);
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const res = await stopBotFn({ data: { sessionId } });
      setSegments(res.segments);
      setStatus("ended");
      toast.success(`Meeting saved — ${Math.round(res.duration / 60)} min recorded`);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to stop bot");
    }
  }

  const isIdle = status === "idle";
  const inMeeting = status === "joining" || status === "connected" || status === "recording" || status === "ending";

  return (
    <>
      <PageHeader
        title="AI Meeting Bot"
        description="The AI joins your meeting as a participant — it hears everyone, sees screen shares, and provides speaker-labeled transcripts."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/meetings">
              <ArrowLeft className="mr-1 h-4 w-4" /> All meetings
            </Link>
          </Button>
        }
      />
      <PageBody>
        {/* Lobby / Join form */}
        {isIdle && (
          <Card className="mx-auto max-w-2xl p-6">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold">Join a meeting</h2>
                  <p className="text-sm text-muted-foreground">
                    Paste a Google Meet, Zoom, or Teams link. The AI bot joins automatically.
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="meeting-url">Meeting link</Label>
                <Input
                  id="meeting-url"
                  value={meetingUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="https://meet.google.com/abc-defg-hij"
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Platform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google-meet">
                      <span className="flex items-center gap-2">
                        <Globe className="h-4 w-4" /> Google Meet
                      </span>
                    </SelectItem>
                    <SelectItem value="zoom">
                      <span className="flex items-center gap-2">
                        <Video className="h-4 w-4" /> Zoom
                      </span>
                    </SelectItem>
                    <SelectItem value="teams">
                      <span className="flex items-center gap-2">
                        <Users className="h-4 w-4" /> Microsoft Teams
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="meeting-title">Meeting title</Label>
                <Input
                  id="meeting-title"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="e.g. Q4 planning call"
                  className="mt-2"
                />
              </div>

              <Button onClick={handleStart} className="w-full" size="lg" disabled={!meetingUrl.trim() || !meetingTitle.trim()}>
                <Bot className="mr-2 h-4 w-4" /> Start AI Bot
              </Button>

              <div className="rounded-lg bg-secondary/40 p-4">
                <h4 className="text-sm font-medium">What the bot does</h4>
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    Listens to all participants and transcribes in real-time
                  </li>
                  <li className="flex gap-2">
                    <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    Identifies speakers and assigns labels
                  </li>
                  <li className="flex gap-2">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    Extracts action items, decisions, and risks
                  </li>
                  <li className="flex gap-2">
                    <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    Sends you the complete notes when the meeting ends
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        )}

        {/* Joining state */}
        {status === "joining" && (
          <div className="mx-auto max-w-md text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              The AI bot is joining the meeting…
            </p>
          </div>
        )}

        {/* Live meeting */}
        {inMeeting && (
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              {/* Participant tiles */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className="relative rounded-xl border border-border bg-card p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`relative grid h-9 w-9 place-items-center rounded-full ${
                          p.isBot
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {p.isBot ? <Bot className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                        {p.isSpeaking && (
                          <span className="animate-pulse-ring absolute inset-0 rounded-full border-2 border-primary/40" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold">{p.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {p.isMuted ? "Muted" : p.isSpeaking ? "Speaking" : "Listening"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Live transcript */}
              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Radio className="h-3.5 w-3.5 animate-pulse text-destructive" />
                    Live transcript · {fmt(elapsed)}
                  </span>
                  <Button variant="destructive" size="sm" onClick={handleEnd} disabled={status === "ending"}>
                    <Square className="mr-1 h-3.5 w-3.5" /> End bot
                  </Button>
                </div>
                <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                  {segments.map((seg) => (
                    <div key={seg.seq} className="group">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {fmt(seg.start_seconds)}
                        </span>
                        {seg.speaker && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {seg.speaker}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm leading-relaxed text-foreground/90">
                        {seg.content}
                      </p>
                    </div>
                  ))}
                  {segments.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      The bot is listening — transcripts will appear here in real time.
                    </p>
                  )}
                  <div ref={segmentsEndRef} />
                </div>
              </Card>
            </div>

            {/* Status sidebar */}
            <Card className="flex h-fit flex-col p-4">
              <h3 className="mb-3 font-display font-semibold">Bot Status</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Platform</span>
                  <span className="font-medium capitalize">{platform.replace("-", " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium tabular-nums">{fmt(elapsed)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Participants</span>
                  <span className="font-medium">{participants.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Segments</span>
                  <span className="font-medium">{segments.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                    {status === "recording" ? "Recording" : status}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Ending state */}
        {status === "ending" && (
          <div className="mx-auto max-w-md text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              Stopping the bot and saving the meeting…
            </p>
          </div>
        )}

        {/* Ended state */}
        {status === "ended" && (
          <div className="mx-auto max-w-md text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-4 text-sm font-medium">Meeting recorded successfully!</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {segments.length} segments captured over {fmt(elapsed)}.
            </p>
            <Button asChild className="mt-4" size="lg">
              <Link to="/meetings">View all meetings</Link>
            </Button>
          </div>
        )}

        {/* Error state */}
        {status === "error" && error && (
          <Card className="mx-auto max-w-md border-destructive/40 bg-destructive/5 p-6 text-center">
            <p className="text-sm font-medium text-destructive">Bot Error</p>
            <p className="mt-2 text-sm text-destructive/80">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                setStatus("idle");
                setError(null);
                setSessionId(null);
              }}
            >
              Try again
            </Button>
          </Card>
        )}
      </PageBody>
    </>
  );
}
