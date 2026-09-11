import type { BotAdapter, BotConfig, BotParticipant, AudioChunk } from "../types";

/**
 * Microsoft Teams adapter.
 *
 * Uses the Microsoft Bot Framework + Teams Calling/Meeting APIs to:
 * 1. Join a Teams meeting as a bot participant
 * 2. Capture audio via the Bot Framework's media streaming
 * 3. Receive real-time audio from all participants
 *
 * Required environment variables:
 *   TEAMS_APP_ID        — Azure AD app registration (Bot Framework)
 *   TEAMS_APP_PASSWORD  — Azure AD app secret
 *   TEAMS_TENANT_ID     — Azure AD tenant ID
 *
 * The bot registers as a calling bot with the Bot Framework and
 * uses the Microsoft Graph API to join Teams meetings.
 */
export class TeamsAdapter implements BotAdapter {
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;
  private participantCallback: ((participants: BotParticipant[]) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private meetingThreadId: string | null = null;

  async join(config: BotConfig): Promise<void> {
    // Extract meeting thread ID from Teams URL
    // Supports: https://teams.microsoft.com/l/meetup-join/19%3ameeting_XXX...
    // or: https://teams.live.com/meet/...
    const url = new URL(config.meetingUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);

    let meetingId = "";
    if (pathParts.includes("meetup-join")) {
      const idx = pathParts.indexOf("meetup-join");
      meetingId = decodeURIComponent(pathParts[idx + 1] || "");
    } else if (pathParts.includes("meet")) {
      meetingId = pathParts[pathParts.length - 1] || "";
    }

    if (!meetingId) {
      throw new Error("Could not extract Teams meeting ID from URL");
    }

    this.meetingThreadId = meetingId;

    // In a real implementation, this would:
    // 1. Authenticate with Azure AD using TEAMS_APP_ID + TEAMS_APP_PASSWORD
    // 2. Get an access token for Microsoft Graph / Bot Framework
    // 3. Use the Bot Framework to join the meeting as a calling bot
    // 4. Set up media streaming to capture audio from the meeting
    // 5. Use Teams' real-time media APIs for PCM audio capture
    //
    // The Bot Framework provides:
    // - invoke Activities to join meetings
    // - Audio/Video media streams from the meeting
    // - Participant update events

    await new Promise((resolve) => setTimeout(resolve, 1500));

    this.participantCallback?.([
      { id: "bot", name: "AI Assistant", isBot: true, isMuted: false, isSpeaking: false },
    ]);
  }

  async leave(): Promise<void> {
    this.meetingThreadId = null;
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
