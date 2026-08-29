import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { getLiveToken, saveLiveTranscript, askLiveRoom } from "@/lib/transcripts.functions";
import { createMeeting, setMeetingAudio } from "@/lib/meetings.functions";
import { analyzeMeeting } from "@/lib/ai.functions";
import { emailMeetingDetails } from "@/lib/email.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { AnimatedBackground } from "@/components/animated-background";
import {
  Bot,
  Mic,
  MicOff,
  Square,
  Loader2,
  Send,
  MessageCircle,
  Sparkles,
  ArrowLeft,
  Radio,
  CheckCircle2,
  Mail,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/meetings/live")({
  head: () => ({ meta: [{ title: "AI live meeting — AI Meeting Operator" }] }),
  component: LiveMeetingRoom,
});

const WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";
const TARGET_RATE = 16000;

function floatToPcmBase64(samples: Float32Array): string {
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

type LiveSegment = {
  seq: number;
  start_seconds: number;
  end_seconds: number;
  speaker: string | null;
  content: string;
};

function LiveMeetingRoom() {
  const navigate = useNavigate();
  const getTokenFn = useServerFn(getLiveToken);
  const saveLiveFn = useServerFn(saveLiveTranscript);
  const askLiveFn = useServerFn(askLiveRoom);
  const createMeetingFn = useServerFn(createMeeting);
  const setAudioFn = useServerFn(setMeetingAudio);
  const analyzeFn = useServerFn(analyzeMeeting);
  const emailFn = useServerFn(emailMeetingDetails);

  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<"lobby" | "starting" | "live" | "ending">("lobby");
  const [sessions, setSessions] = useState<{ text: string; ts: number }[]>([]);
  const [liveText, setLiveText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [step, setStep] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const blobsRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<{ text: string; ts: number }[]>([]);
  const liveTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef("");

  const transcriptSoFar = useCallback(
    () => sessionRef.current.map((s) => s.text).join(" ") + (liveText ? ` ${liveText}` : ""),
    [liveText],
  );

  const pushSession = useCallback((text: string) => {
    const now = (Date.now() - startTimeRef.current) / 1000;
    sessionRef.current.push({ text, ts: now });
    setSessions([...sessionRef.current]);
    setLiveText("");
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (liveTickerRef.current) clearInterval(liveTickerRef.current);
    if (gapTimerRef.current) clearTimeout(gapTimerRef.current);
    try {
      processorRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    } catch {
      // ignore
    }
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  function fmt(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  async function join() {
    if (!title.trim()) return toast.error("Give the meeting a title first");
    setStage("starting");
    try {
      const { token, model } = await getTokenFn();
      if (!token) throw new Error("No token");

      const ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${model}`,
              generationConfig: {
                responseModalities: ["TEXT"],
                inputAudioTranscription: {},
                temperature: 0,
              },
              systemInstruction: {
                parts: [
                  {
                    text: "You are the AI assistant inside a live meeting. Transcribe each speaker's words verbatim. Do not respond with anything other than transcriptions.",
                  },
                ],
              },
            },
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.setupComplete) {
            setStage("live");
            startTimeRef.current = Date.now();
            timerRef.current = setInterval(() => {
              setElapsed((Date.now() - startTimeRef.current) / 1000);
            }, 500);
          }
          const content = msg.serverContent;
          if (content && content.inputTranscription?.text) {
            const text: string = content.inputTranscription.text;
            if (
              !sessionRef.current.length ||
              text.includes(sessionRef.current[sessionRef.current.length - 1].text)
            ) {
              setLiveText(text);
            } else {
              const finalText = sessionRef.current[sessionRef.current.length - 1]?.text || "";
              if (finalText) {
                const merged = finalText.trim() + " " + text.trim();
                const idx = sessionRef.current.length - 1;
                sessionRef.current[idx] = { ...sessionRef.current[idx], text: merged };
                setSessions([...sessionRef.current]);
              }
              setLiveText("");
            }
          }
          if (msg.error) {
            toast.error("Live transcription error: " + JSON.stringify(msg.error));
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => toast.error("Live connection error");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = proc;
      const ratio = ctx.sampleRate / TARGET_RATE;

      let downBuf: Float32Array = new Float32Array(0);
      proc.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const input = e.inputBuffer.getChannelData(0);
        const outLen = Math.floor(input.length / ratio);
        const out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) out[i] = input[Math.floor(i * ratio)];
        const combined = new Float32Array(downBuf.length + out.length);
        combined.set(downBuf);
        combined.set(out, downBuf.length);
        downBuf = combined;
        const chunkLen = Math.floor(TARGET_RATE * 0.2);
        if (downBuf.length >= chunkLen) {
          const toSend = downBuf.slice(0, chunkLen);
          downBuf = downBuf.slice(chunkLen);
          wsRef.current.send(
            JSON.stringify({
              realtimeInput: {
                mediaChunks: [
                  { data: floatToPcmBase64(toSend), mimeType: `audio/pcm;rate=${TARGET_RATE}` },
                ],
              },
            }),
          );
        }
      };
      source.connect(proc);
      proc.connect(ctx.destination);

      blobsRef.current = [];
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) blobsRef.current.push(ev.data);
      };
      mr.start(1000);
      recorderRef.current = mr;

      liveTickerRef.current = setInterval(() => {
        if (liveText && liveText !== draftRef.current) draftRef.current = liveText;
      }, 400);
      gapTimerRef.current = setInterval(() => {
        if (draftRef.current) {
          pushSession(draftRef.current);
          draftRef.current = "";
        }
      }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start live meeting");
      cleanup();
      setStage("lobby");
    }
  }

  async function askAi() {
    const q = chatInput.trim();
    if (!q || chatBusy) return;
    setChatInput("");
    setChatMsgs((m) => [...m, { role: "user", text: q }]);
    setChatBusy(true);
    try {
      const res = await askLiveFn({
        data: { transcript: transcriptSoFar(), question: q },
      });
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

  async function endMeeting(sendEmail = true) {
    setStage("ending");
    cleanup();
    const recorder = recorderRef.current;
    recorderRef.current = null;

    const observed = sessionRef.current;
    const blob = new Blob(blobsRef.current, {
      type: recorder?.mimeType || "audio/webm",
    });
    if (!observed.length) {
      toast.info("Nothing was transcribed in this session.");
      setStage("lobby");
      return;
    }

    try {
      setStep("Creating meeting…");
      const meeting = await createMeetingFn({
        data: {
          title: title.trim(),
          scheduled_at: new Date().toISOString(),
        },
      });

      setStep("Uploading audio…");
      const wsData = await supabase.auth.getUser();
      const uid = wsData.data.user?.id;
      if (!uid) throw new Error("No user");
      const ext =
        blob.type.includes("webm") ? "webm" : blob.type.includes("mp4") ? "mp4" : "webm";
      const path = `${meeting.workspace_id}/${meeting.id}/media.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("meeting-audio")
        .upload(path, blob, { contentType: blob.type || "audio/webm", upsert: true });
      if (upErr) throw upErr;

      await setAudioFn({
        data: { id: meeting.id, audio_path: path, duration_seconds: Math.round(elapsed) },
      });

      setStep("Saving transcript…");
      const transcript = observed.map((s) => s.text).join(" ");
      const segments: LiveSegment[] = observed.map((s, i) => {
        const duration = Math.max(0.6, s.text.split(" ").length * 0.45);
        const start = i === 0 ? 0 : s.ts;
        const end = Math.min(start + duration, elapsed || start + duration);
        return {
          seq: i,
          start_seconds: Number(start.toFixed(2)),
          end_seconds: Number(end.toFixed(2)),
          speaker: null,
          content: s.text.trim(),
        };
      });
      await saveLiveFn({
        data: {
          meetingId: meeting.id,
          transcript,
          segments,
          duration_seconds: Math.round(elapsed),
        },
      });

      setStep("Extracting action items, decisions, risks…");
      try {
        await analyzeFn({ data: { meetingId: meeting.id } });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Analysis failed");
      }

      if (sendEmail) {
        setStep("Emailing the complete notes…");
        try {
          const res = await emailFn({
            data: {
              meetingId: meeting.id,
              baseUrl: import.meta.env.VITE_APP_URL || window.location.origin,
            },
          });
          toast.success(`Meeting notes emailed to ${res.to}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not email the notes");
        }
      }

      toast.success("Meeting saved & analyzed!");
      navigate({ to: "/meetings/$meetingId", params: { meetingId: meeting.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the meeting");
      setStage("lobby");
    } finally {
      setStep("");
      setSessions([]);
      sessionRef.current = [];
      setElapsed(0);
    }
  }

  const live = stage === "live";
  const inRoom = stage === "live" || stage === "starting" || stage === "ending";

  return (
    <div className="relative flex min-h-screen flex-col">
      <AnimatedBackground />
      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/meetings">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="font-display text-sm font-semibold">
              {inRoom ? title : "AI live meeting"}
            </div>
            {inRoom && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                Recording · {fmt(elapsed)}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {live && (
            <Button variant="outline" size="sm" onClick={() => setChatOpen((v) => !v)}>
              <MessageCircle className="mr-1 h-4 w-4" /> Ask the AI
            </Button>
          )}
          {inRoom && (
            <Button variant="destructive" size="sm" onClick={() => endMeeting(true)} disabled={stage === "ending"}>
              {stage === "ending" ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Finishing…
                </>
              ) : (
                <>
                  <Square className="mr-1 h-4 w-4" /> End meeting
                </>
              )}
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">
        {/* Lobby */}
        {stage === "lobby" && (
          <div className="mx-auto mt-10 max-w-xl">
            <Card className="p-8">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Radio className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-xl font-semibold">Start an AI-attended meeting</h2>
                  <p className="text-sm text-muted-foreground">
                    The AI assistant joins as a participant, takes live notes, and emails the
                    complete summary when you end the call.
                  </p>
                </div>
              </div>

              <div className="mt-8">
                <Label htmlFor="room-title">Meeting title</Label>
                <Input
                  id="room-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q4 planning"
                  className="mt-2"
                  onKeyDown={(e) => e.key === "Enter" && join()}
                />
              </div>

              {/* Participants preview */}
              <div className="mt-8 grid grid-cols-2 gap-3">
                <ParticipantTile
                  name="You"
                  icon={<Mic className="h-5 w-5" />}
                  status="Joining on join"
                  color="bg-primary/10 text-primary"
                  animated={false}
                />
                <ParticipantTile
                  name="AI Assistant"
                  icon={<Bot className="h-5 w-5" />}
                  status="Will take notes"
                  color="bg-emerald-500/10 text-emerald-600"
                  animated={false}
                />
              </div>

              <div className="mt-8 flex items-center gap-3">
                <Button onClick={join} className="flex-1" size="lg" disabled={!title.trim()}>
                  <Bot className="mr-2 h-4 w-4" /> Start meeting with AI
                </Button>
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Microphone permission is required. Captions appear in real time.
              </p>
            </Card>
          </div>
        )}

        {/* Starting */}
        {stage === "starting" && (
          <div className="mx-auto mt-16 max-w-md text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              The AI assistant is joining the meeting…
            </p>
          </div>
        )}

        {/* Live room */}
        {live && (
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            {/* Participants + captions */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <ParticipantTile
                  name="You"
                  icon={muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  status={muted ? "Muted" : "Speaking"}
                  color="bg-primary/10 text-primary"
                  animated={!muted}
                />
                <ParticipantTile
                  name="AI Assistant"
                  icon={<Bot className="h-5 w-5" />}
                  status="Listening & transcribing"
                  color="bg-emerald-500/10 text-emerald-600"
                  animated
                />
              </div>

              <Card className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Radio className="h-3.5 w-3.5 animate-pulse text-destructive" />
                    Live captions
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setMuted((m) => !m)}>
                    {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    <span className="ml-1 hidden sm:inline">{muted ? "Unmute" : "Mute"}</span>
                  </Button>
                </div>
                <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                  {sessions.map((s, i) => (
                    <p key={i} className="text-sm leading-relaxed text-foreground/90">
                      {s.text}
                    </p>
                  ))}
                  {liveText && (
                    <p className="text-sm italic leading-relaxed text-muted-foreground">{liveText}</p>
                  )}
                  {sessions.length === 0 && !liveText && (
                    <p className="text-sm text-muted-foreground">
                      The AI is listening — speak now and captions will appear here in real time.
                    </p>
                  )}
                </div>
              </Card>
            </div>

            {/* Ask the AI panel */}
            <Card className="flex h-[calc(100vh-10rem)] flex-col p-4">
              <div className="mb-3 flex items-center gap-2 font-display font-semibold">
                <Bot className="h-4 w-4 text-primary" /> Ask the AI
              </div>
              <div className="max-h-full flex-1 space-y-3 overflow-y-auto pr-1">
                {chatMsgs.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    The AI knows everything said in this meeting so far. Ask e.g. "What deadlines
                    have been mentioned?" or "Summarize what we've agreed on."
                  </p>
                )}
                {chatMsgs.map((m, i) => (
                  <div
                    key={i}
                    className={
                      "rounded-lg px-3 py-2 text-sm " +
                      (m.role === "user"
                        ? "ml-6 bg-primary/10 text-foreground"
                        : "mr-6 bg-secondary/60 text-foreground/90")
                    }
                  >
                    {m.text}
                  </div>
                ))}
                {chatBusy && (
                  <div className="mr-6 inline-block rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                    Thinking…
                  </div>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && askAi()}
                  placeholder="Ask the AI…"
                  disabled={chatBusy}
                />
                <Button onClick={askAi} disabled={chatBusy || !chatInput.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Ending */}
        {stage === "ending" && (
          <div className="mx-auto mt-16 max-w-md text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-4 text-sm font-medium">Finishing the meeting</p>
            <p className="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" />
              {step || "Processing…"}
            </p>
          </div>
        )}
      </main>

      {stage === "lobby" && (
        <footer className="border-t border-border/60 py-6 text-center text-xs text-muted-foreground">
          <p className="flex items-center justify-center gap-1.5">
            <Mail className="h-3.5 w-3.5" /> When you end the meeting, the complete notes are emailed
            to your inbox.
          </p>
        </footer>
      )}
    </div>
  );
}

function ParticipantTile({
  name,
  icon,
  status,
  color,
  animated,
}: {
  name: string;
  icon: React.ReactNode;
  status: string;
  color: string;
  animated: boolean;
}) {
  return (
    <div className="relative rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className={`relative grid h-11 w-11 place-items-center rounded-full ${color}`}>
          {icon}
          {animated && (
            <>
              <span className="animate-pulse-ring absolute inset-0 rounded-full border-2 border-emerald-500/40" />
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
            </>
          )}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {name}
          </div>
          <div className="truncate text-xs text-muted-foreground">{status}</div>
        </div>
      </div>
    </div>
  );
}
