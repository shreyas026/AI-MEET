export type MeetingPlatform = "google-meet" | "zoom" | "teams";

export interface BotConfig {
  platform: MeetingPlatform;
  meetingUrl: string;
  meetingTitle: string;
  botName?: string;
  workspaceId: string;
  userId: string;
}

export interface BotSession {
  id: string;
  platform: MeetingPlatform;
  meetingUrl: string;
  meetingTitle: string;
  status: "joining" | "connected" | "recording" | "ended" | "error";
  startedAt: string;
  endedAt?: string;
  error?: string;
  transcript: string;
  segments: BotSegment[];
  participants: BotParticipant[];
}

export interface BotParticipant {
  id: string;
  name: string;
  isBot: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
}

export interface BotSegment {
  seq: number;
  start_seconds: number;
  end_seconds: number;
  speaker: string | null;
  speakerId: string | null;
  content: string;
}

export interface BotAdapter {
  join(config: BotConfig): Promise<void>;
  leave(): Promise<void>;
  getParticipants(): Promise<BotParticipant[]>;
  onAudioChunk(callback: (chunk: AudioChunk) => void): void;
  onParticipantUpdate(callback: (participants: BotParticipant[]) => void): void;
  onError(callback: (error: Error) => void): void;
}

export interface AudioChunk {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
  timestamp: number;
}

export interface TranscriptionSegment {
  speaker: string | null;
  speakerId: string | null;
  content: string;
  start_seconds: number;
  end_seconds: number;
}
