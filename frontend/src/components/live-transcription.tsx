import { useRef, useState, useCallback, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getLiveToken } from "@/lib/transcripts.functions";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";

type Segment = {
  seq: number;
  start_seconds: number;
  end_seconds: number;
  speaker: string | null;
  content: string;
};

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

export function LiveTranscriptRecorder({
  disabled,
  onFinished,
}: {
  disabled?: boolean;
  onFinished: (data: {
    transcript: string;
    segments: Segment[];
    blob: Blob;
    duration_seconds: number;
  }) => void;
}) {
  const getTokenFn = useServerFn(getLiveToken);

  const [sessions, setSessions] = useState<{ text: string; ts: number }[]>([]);
  const [liveText, setLiveText] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "starting" | "live" | "stoping">("idle");
  const [elapsed, setElapsed] = useState(0);

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

  const pushSession = useCallback((text: string) => {
    const now = (Date.now() - startTimeRef.current) / 1000;
    sessionRef.current.push({ text, ts: now });
    setSessions([...sessionRef.current]);
    // Reset floating partial after final snippet
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

  const sendAudioChunk = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    // Push an empty activity frame to flush transcription; real audio handled by processor
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  function fmt(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  async function start() {
    setStatus("starting");
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
                    text: "You are a meeting transcription bot. Transcribe the user's speech verbatim into clean text. Do not respond with anything other than transcriptions.",
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
            setStatus("live");
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
              // Append to last segment progressively
              setLiveText(text);
            } else {
              const finalText = sessionRef.current[sessionRef.current.length - 1]?.text || "";
              if (finalText) {
                const merged =
                  finalText.trim() +
                  (finalText.trim().endsWith(".") ||
                  finalText.trim().endsWith("?") ||
                  finalText.trim().endsWith("!")
                    ? " "
                    : " ") +
                  text.trim();
                const idx = sessionRef.current.length - 1;
                sessionRef.current[idx] = { ...sessionRef.current[idx], text: merged };
                setSessions([...sessionRef.current]);
              }
              setLiveText("");
            }
          }
          if (msg.error) {
            toast.error("Live transcription error: " + JSON.stringify(msg.error));
            stop(false);
          }
          if (msg.goAway) {
            toast.info("Live session ending soon…");
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => toast.error("Live connection error");

      // ---- mic capture ----
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
        // decimate to 16kHz
        const outLen = Math.floor(input.length / ratio);
        const out = new Float32Array(outLen);
        for (let i = 0; i < outLen; i++) {
          out[i] = input[Math.floor(i * ratio)];
        }
        const combined = new Float32Array(downBuf.length + out.length);
        combined.set(downBuf);
        combined.set(out, downBuf.length);
        downBuf = combined;

        // Flush ~200ms chunks (3200 samples at 16kHz)
        const chunkLen = Math.floor(TARGET_RATE * 0.2);
        if (downBuf.length >= chunkLen) {
          const toSend = downBuf.slice(0, chunkLen);
          downBuf = downBuf.slice(chunkLen);
          const mime = `audio/pcm;rate=${TARGET_RATE}`;
          wsRef.current.send(
            JSON.stringify({
              realtimeInput: {
                mediaChunks: [{ data: floatToPcmBase64(toSend), mimeType: mime }],
              },
            }),
          );
        }
      };
      source.connect(proc);
      proc.connect(ctx.destination);

      // Also record a playable copy via MediaRecorder
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

      // Draft segment accumulation on live snippets
      let draft = "";
      let draftTs = 0;
      liveTickerRef.current = setInterval(() => {
        if (liveText && liveText !== draft) {
          if (!draft) draftTs = (Date.now() - startTimeRef.current) / 1000;
          draft = liveText;
        }
      }, 400);
      gapTimerRef.current = setInterval(() => {
        if (draft) {
          pushSession(draft);
          draft = "";
        }
      }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start live transcription");
      cleanup();
      setStatus("idle");
    }
  }

  function stop(save = true) {
    if (status !== "live") return;
    setStatus("stoping");
    cleanup();
    setStatus("idle");

    recorderRef.current?.stop();
    const recorder = recorderRef.current;
    recorderRef.current = null;

    const observed = sessionRef.current;
    if (save && observed.length) {
      const transcript = observed.map((s) => s.text).join(" ");
      // Build final segments from observed sessions
      const segments: Segment[] = [];
      let prevEnd = 0;
      observed.forEach((s, i) => {
        const duration = Math.max(0.6, s.text.split(" ").length * 0.45);
        const start = i === 0 ? 0 : Math.max(s.ts - 1.5, prevEnd);
        const end = Math.min(start + duration, elapsed || start + duration);
        segments.push({
          seq: i,
          start_seconds: Number(start.toFixed(2)),
          end_seconds: Number(end.toFixed(2)),
          speaker: null,
          content: s.text.trim(),
        });
        prevEnd = end;
      });

      const finish = (blob: Blob | null) => {
        onFinished({
          transcript,
          segments,
          blob:
            blob ??
            new Blob(blobsRef.current, { type: (recorder?.mimeType || "audio/webm") as string }),
          duration_seconds: Math.round(elapsed),
        });
      };

      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = () => {
          finish(
            new Blob(blobsRef.current, {
              type: recorder.mimeType || "audio/webm",
            }),
          );
        };
      } else {
        finish(new Blob(blobsRef.current, { type: "audio/webm" }));
      }
    } else {
      toast.info("Nothing was transcribed in this live session.");
    }
    setSessions([]);
    sessionRef.current = [];
    setElapsed(0);
  }

  const live = status === "live";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-secondary/40 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {live ? (
              <span className="flex items-center gap-2 text-sm font-medium text-destructive">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                Live transcription
              </span>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">
                {status === "starting" ? "Connecting…" : "Ready to record"}
              </span>
            )}
            <span className="font-display text-3xl font-semibold tabular-nums">{fmt(elapsed)}</span>
          </div>
          <div className="flex gap-2">
            {!live && status !== "starting" && (
              <Button onClick={start} disabled={disabled}>
                <Mic className="mr-2 h-4 w-4" /> Start live
              </Button>
            )}
            {status === "starting" && (
              <Button disabled>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connecting…
              </Button>
            )}
            {live && (
              <Button variant="destructive" onClick={() => stop(true)}>
                <Square className="mr-2 h-4 w-4" /> Stop & save
              </Button>
            )}
          </div>
        </div>
      </div>

      {live && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Radio className="h-3.5 w-3.5 animate-pulse text-destructive" />
            Captions
          </div>
          <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
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
                Speak now — captions will appear here in real time.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
