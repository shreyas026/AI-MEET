import type { BotAdapter, BotConfig, BotParticipant, AudioChunk } from "../types";

/**
 * Zoom Meeting adapter.
 *
 * Uses the Zoom Meeting SDK (formerly Zoom Web SDK) to:
 * 1. Generate a signature for the meeting
 * 2. Join as a bot participant via WebRTC
 * 3. Capture audio from all participants
 *
 * Required environment variables:
 *   ZOOM_SDK_KEY      — Zoom Meeting SDK key
 *   ZOOM_SDK_SECRET   — Zoom Meeting SDK secret
 *   ZOOM_ACCOUNT_ID   — Zoom account ID (for server-side auth)
 *
 * The bot joins silently (audio-only, no video) and captures the
 * mixed audio stream from all participants.
 */
export class ZoomAdapter implements BotAdapter {
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;
  private participantCallback: ((participants: BotParticipant[]) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private meetingNumber: string | null = null;

  async join(config: BotConfig): Promise<void> {
    // Extract meeting number from Zoom URL
    // Supports: https://zoom.us/j/123456789 or https://zoom.us/wc/join/123456789
    const url = new URL(config.meetingUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const meetingNumber = pathParts[pathParts.length - 1] || "";

    if (!meetingNumber || !/^\d+$/.test(meetingNumber)) {
      throw new Error("Could not extract Zoom meeting number from URL");
    }

    this.meetingNumber = meetingNumber;

    // In a real implementation, this would:
    // 1. Generate an SDK signature using ZOOM_SDK_KEY + ZOOM_SDK_SECRET
    // 2. Initialize the Zoom Meeting SDK (client-side) or use REST API
    // 3. Join the meeting with audio capture enabled
    // 4. Set up audio stream capture from the mixed audio
    //
    // Zoom provides a mixed audio stream via the Meeting SDK's
    // Audio Raw Data feature which gives PCM audio from all participants.

    await new Promise((resolve) => setTimeout(resolve, 1500));

    this.participantCallback?.([
      { id: "bot", name: "AI Assistant", isBot: true, isMuted: false, isSpeaking: false },
    ]);
  }

  async leave(): Promise<void> {
    this.meetingNumber = null;
  }

  async getParticipants(): Promise<BotParticipant[]> {
    return [
      { id: "bot", name: "AI Assistant", isBot: true, isMuted: false, isSpeaking: false },
    ];
  }

  onAudioChunk(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  onParticipantUpdate(callback: (participants: BotParticipant[]) => void): void {
    this.participantCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }
}
