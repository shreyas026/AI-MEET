import type {
  BotConfig,
  BotSession,
  BotAdapter,
  AudioChunk,
  BotSegment,
  BotParticipant,
} from "./types";
import { GoogleMeetAdapter } from "./adapters/google-meet";
import { ZoomAdapter } from "./adapters/zoom";
import { TeamsAdapter } from "./adapters/teams";
import { generateTextCompletion } from "@/lib/gemini.server";

const TARGET_RATE = 16000;

function createAdapter(platform: string): BotAdapter {
  switch (platform) {
    case "google-meet":
      return new GoogleMeetAdapter();
    case "zoom":
      return new ZoomAdapter();
    case "teams":
      return new TeamsAdapter();
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Active bot sessions (in-memory; in production use Redis or DB)
const activeSessions = new Map<string, BotEngine>();

export class BotEngine {
  session: BotSession;
  private adapter: BotAdapter;
  private audioChunks: AudioChunk[] = [];
  private transcriptParts: string[] = [];
  private currentSegment: string = "";
  private segmentStartTime: number = 0;
  private elapsed: number = 0;
  private timerRef: ReturnType<typeof setInterval> | null = null;
  private flushTimerRef: ReturnType<typeof setInterval> | null = null;
  private onSegmentCallback: ((seg: BotSegment) => void) | null = null;
  private onTranscriptCallback: ((text: string) => void) | null = null;
  private onStatusCallback: ((status: BotSession["status"]) => void) | null = null;
  private onParticipantsCallback: ((p: BotParticipant[]) => void) | null = null;
  private onErrorCallback: ((err: Error) => void) | null = null;

  constructor(config: BotConfig) {
    this.adapter = createAdapter(config.platform);
    this.session = {
      id: crypto.randomUUID(),
      platform: config.platform,
      meetingUrl: config.meetingUrl,
      meetingTitle: config.meetingTitle,
      status: "joining",
      startedAt: new Date().toISOString(),
      transcript: "",
      segments: [],
      participants: [],
    };
  }

  onSegment(cb: (seg: BotSegment) => void) {
    this.onSegmentCallback = cb;
  }

  onTranscript(cb: (text: string) => void) {
    this.onTranscriptCallback = cb;
  }

  onStatus(cb: (status: BotSession["status"]) => void) {
    this.onStatusCallback = cb;
  }

  onParticipants(cb: (participants: BotParticipant[]) => void) {
    this.onParticipantsCallback = cb;
  }

  onError(cb: (err: Error) => void) {
    this.onErrorCallback = cb;
  }

  private setStatus(status: BotSession["status"]) {
    this.session.status = status;
    this.onStatusCallback?.(status);
  }

  async start(config: BotConfig) {
    try {
      this.setStatus("joining");

      // Set up adapter callbacks
      this.adapter.onAudioChunk((chunk) => this.handleAudioChunk(chunk));
      this.adapter.onParticipantUpdate((participants) => {
        this.session.participants = participants;
        this.onParticipantsCallback?.(participants);
      });
      this.adapter.onError((err) => {
        this.session.status = "error";
        this.session.error = err.message;
        this.onErrorCallback?.(err);
      });

      await this.adapter.join(config);
      this.setStatus("connected");

      // Start elapsed timer
      this.timerRef = setInterval(() => {
        this.elapsed += 1;
      }, 1000);

      // Flush audio to Gemini every 3 seconds for real-time transcription
      this.flushTimerRef = setInterval(() => this.flushAudio(), 3000);

      // Auto-stop after 8 hours (safety limit)
      setTimeout(() => {
        if (this.session.status !== "ended") this.stop();
      }, 8 * 60 * 60 * 1000);

      activeSessions.set(this.session.id, this);
    } catch (err) {
      this.session.status = "error";
      this.session.error = err instanceof Error ? err.message : String(err);
      this.onErrorCallback?.(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  async stop() {
    if (this.session.status === "ended") return;
    this.setStatus("ended");
    this.session.endedAt = new Date().toISOString();

    if (this.timerRef) clearInterval(this.timerRef);
    if (this.flushTimerRef) clearInterval(this.flushTimerRef);

    // Flush any remaining audio
    await this.flushAudio();

    // Build final transcript
    this.session.transcript = this.transcriptParts.join(" ");

    try {
      await this.adapter.leave();
    } catch {
      // ignore cleanup errors
    }

    activeSessions.delete(this.session.id);
  }

  private handleAudioChunk(chunk: AudioChunk) {
    this.audioChunks.push(chunk);
    this.setStatus("recording");
  }

  private async flushAudio() {
    if (this.audioChunks.length === 0) return;

    const chunks = this.audioChunks.splice(0);
    const totalSamples = chunks.reduce((sum, c) => sum + c.data.byteLength / 2, 0);
    if (totalSamples === 0) return;

    // Merge all PCM16 chunks into one buffer
    const merged = new ArrayBuffer(totalSamples * 2);
    const mergedView = new DataView(merged);
    let offset = 0;
    for (const chunk of chunks) {
      const src = new DataView(chunk.data);
      for (let i = 0; i < chunk.data.byteLength; i += 2) {
        mergedView.setInt16(offset, src.getInt16(i, true), true);
        offset += 2;
      }
    }

    // Convert to base64
    const bytes = new Uint8Array(merged);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const audioBase64 = btoa(binary);

    const startSec = this.segmentStartTime;
    const endSec = this.elapsed;
    this.segmentStartTime = this.elapsed;

    try {
      // Use Gemini to transcribe this audio chunk with speaker diarization
      const participantNames = this.session.participants
        .filter((p) => !p.isBot)
        .map((p) => p.name)
        .join(", ");

      const prompt = `You are a meeting transcription expert. Transcribe the audio below.
${participantNames ? `Known participants: ${participantNames}. Use their names as speaker labels when you can identify who is speaking.` : "Identify different speakers as Speaker 1, Speaker 2, etc."}

Return ONLY a JSON array of speaker turns:
[{"speaker": "Name or Speaker N", "content": "what they said"}, ...]

If you cannot determine the speaker, use null for the speaker field.`;

      const result = await generateTextCompletion(
        `You are an expert transcriber. Always respond with valid JSON.\n\n${prompt}`,
      );

      let turns: Array<{ speaker: string | null; content: string }> = [];
      try {
        let stripped = result.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
        const match = stripped.match(/\[[\s\S]*\]/);
        turns = JSON.parse(match ? match[0] : stripped);
      } catch {
        // Fallback: treat entire output as single segment
        turns = [{ speaker: null, content: result }];
      }

      let seq = this.session.segments.length;
      let charCursor = 0;
      const totalChars = turns.reduce((s, t) => s + t.content.length, 0) || 1;

      for (const turn of turns) {
        const dur = (turn.content.length / totalChars) * (endSec - startSec);
        const segStart = startSec + (charCursor / totalChars) * (endSec - startSec);
        charCursor += turn.content.length;
        const segEnd = startSec + (charCursor / totalChars) * (endSec - startSec);

        const segment: BotSegment = {
          seq: seq++,
          start_seconds: Number(segStart.toFixed(2)),
          end_seconds: Number(segEnd.toFixed(2)),
          speaker: turn.speaker,
          speakerId: null,
          content: turn.content.trim(),
        };

        this.session.segments.push(segment);
        this.transcriptParts.push(turn.content.trim());
        this.currentSegment = "";
        this.onSegmentCallback?.(segment);
      }

      this.onTranscriptCallback?.(this.session.transcript);
    } catch (err) {
      // Non-fatal: log and continue
      console.error("Bot transcription chunk failed:", err);
    }
  }

  getSegments(): BotSegment[] {
    return this.session.segments;
  }

  getTranscript(): string {
    return this.session.transcript;
  }

  getSession(): BotSession {
    return this.session;
  }
}

export function getActiveSessions(): BotEngine[] {
  return Array.from(activeSessions.values());
}

export function getSession(id: string): BotEngine | undefined {
  return activeSessions.get(id);
}
