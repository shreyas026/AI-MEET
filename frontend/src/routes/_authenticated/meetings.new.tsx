import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mic, StopCircle, Upload, Sparkles } from "lucide-react";
import { createMeeting, setMeetingAudio } from "@/lib/meetings.functions";
import { listProjects } from "@/lib/projects.functions";
import { transcribeMeeting, analyzeMeeting } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/meetings/new")({
  head: () => ({ meta: [{ title: "New meeting — AI Meeting Operator" }] }),
  component: NewMeeting,
});

function NewMeeting() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [mode, setMode] = useState<"upload" | "record">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string>("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const listProjectsFn = useServerFn(listProjects);
  const createMeetingFn = useServerFn(createMeeting);
  const setAudioFn = useServerFn(setMeetingAudio);
  const transcribeFn = useServerFn(transcribeMeeting);
  const analyzeFn = useServerFn(analyzeMeeting);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjectsFn(),
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (err) {
      toast.error("Microphone access denied");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function submit() {
    if (!title.trim()) return toast.error("Please give the meeting a title");
    const audioBlob = mode === "record" ? recordedBlob : file;
    if (!audioBlob) return toast.error("Please attach audio to transcribe");

    setBusy(true);
    try {
      setStep("Creating meeting…");
      const meeting = await createMeetingFn({
        data: {
          title: title.trim(),
          project_id: projectId !== "none" ? projectId : null,
          scheduled_at: new Date().toISOString(),
        },
      });

      // Upload audio to storage
      setStep("Uploading audio…");
      const wsData = await supabase.auth.getUser();
      const uid = wsData.data.user?.id;
      if (!uid) throw new Error("No user");
      // Derive extension from blob type
      const ext =
        (audioBlob as File).name?.split(".").pop() ||
        (audioBlob.type.includes("webm")
          ? "webm"
          : audioBlob.type.includes("mp4")
            ? "m4a"
            : audioBlob.type.includes("wav")
              ? "wav"
              : audioBlob.type.includes("mpeg")
                ? "mp3"
                : "webm");
      const path = `${meeting.workspace_id}/${meeting.id}/audio.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("meeting-audio")
        .upload(path, audioBlob, {
          contentType: audioBlob.type || `audio/${ext}`,
          upsert: true,
        });
      if (upErr) throw upErr;

      await setAudioFn({
        data: {
          id: meeting.id,
          audio_path: path,
          duration_seconds: mode === "record" ? elapsed : null,
        },
      });

      setStep("Transcribing…");
      await transcribeFn({ data: { meetingId: meeting.id } });

      setStep("Extracting action items, decisions, risks…");
      await analyzeFn({ data: { meetingId: meeting.id } });

      toast.success("Meeting analyzed!");
      navigate({ to: "/meetings/$meetingId", params: { meetingId: meeting.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <>
      <PageHeader
        title="New meeting"
        description="Record live or upload audio. AI Meeting Operator handles the rest."
      />
      <PageBody>
        <Card className="mx-auto max-w-2xl p-6">
          <div className="space-y-5">
            <div>
              <Label htmlFor="title">Meeting title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q4 kickoff"
                disabled={busy}
              />
            </div>

            <div>
              <Label>Project</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={busy}>
                <SelectTrigger>
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {(projects ?? []).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Audio source</Label>
              <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload" disabled={busy}>
                    <Upload className="mr-2 h-4 w-4" /> Upload
                  </TabsTrigger>
                  <TabsTrigger value="record" disabled={busy}>
                    <Mic className="mr-2 h-4 w-4" /> Record
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="mt-4">
                  <div className="rounded-lg border-2 border-dashed border-border bg-secondary/40 p-8 text-center">
                    <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm text-muted-foreground">
                      Drop an mp3, wav, m4a, or webm file
                    </p>
                    <Input
                      type="file"
                      accept="audio/*"
                      className="mx-auto mt-4 max-w-xs"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      disabled={busy}
                    />
                    {file && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                      </p>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="record" className="mt-4">
                  <div className="rounded-lg border border-border bg-secondary/40 p-8 text-center">
                    <div className="font-display text-4xl font-semibold tabular-nums">
                      {fmt(elapsed)}
                    </div>
                    <div className="mt-6 flex justify-center gap-3">
                      {!recording ? (
                        <Button onClick={startRecording} disabled={busy || !!recordedBlob}>
                          <Mic className="mr-2 h-4 w-4" /> Start recording
                        </Button>
                      ) : (
                        <Button onClick={stopRecording} variant="destructive">
                          <StopCircle className="mr-2 h-4 w-4" /> Stop
                        </Button>
                      )}
                      {recordedBlob && !recording && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setRecordedBlob(null);
                            setElapsed(0);
                          }}
                          disabled={busy}
                        >
                          Re-record
                        </Button>
                      )}
                    </div>
                    {recording && (
                      <p className="mt-4 flex items-center justify-center gap-2 text-xs text-destructive">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                        Recording
                      </p>
                    )}
                    {recordedBlob && !recording && (
                      <p className="mt-4 text-xs text-emerald-700">
                        Recording captured ({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB)
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <Button onClick={submit} disabled={busy} className="w-full" size="lg">
              {busy ? (
                <>
                  <Sparkles className="mr-2 h-4 w-4 animate-pulse" /> {step || "Processing…"}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" /> Transcribe & analyze
                </>
              )}
            </Button>
            {busy && (
              <p className="text-center text-xs text-muted-foreground">
                This can take 30–90 seconds for longer meetings. Please keep this tab open.
              </p>
            )}
          </div>
        </Card>
      </PageBody>
    </>
  );
}