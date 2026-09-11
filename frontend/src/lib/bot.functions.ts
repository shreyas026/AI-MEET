import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getOrCreateWorkspace } from "@/lib/workspace.functions";
import { BotEngine, getActiveSessions, getSession } from "@/lib/bot";
import type { MeetingPlatform } from "@/lib/bot";

// Start a bot session that joins an external meeting
export const startBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        platform: z.enum(["google-meet", "zoom", "teams"]),
        meetingUrl: z.string().url(),
        meetingTitle: z.string().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ws = await getOrCreateWorkspace(supabase, userId);

    const engine = new BotEngine({
      platform: data.platform as MeetingPlatform,
      meetingUrl: data.meetingUrl,
      meetingTitle: data.meetingTitle,
      workspaceId: ws.workspace_id,
      userId,
    });

    await engine.start({
      platform: data.platform as MeetingPlatform,
      meetingUrl: data.meetingUrl,
      meetingTitle: data.meetingTitle,
      workspaceId: ws.workspace_id,
      userId,
    });

    return { sessionId: engine.session.id, status: engine.session.status };
  });

// Stop an active bot session and save results
export const stopBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ sessionId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const engine = getSession(data.sessionId);
    if (!engine) throw new Error("Session not found or already ended");

    await engine.stop();

    return {
      sessionId: engine.session.id,
      status: engine.session.status,
      transcript: engine.session.transcript,
      segments: engine.session.segments,
      duration: engine.session.endedAt
        ? Math.round(
            (new Date(engine.session.endedAt).getTime() -
              new Date(engine.session.startedAt).getTime()) /
              1000,
          )
        : 0,
    };
  });

// Get status of a bot session
export const getBotStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ sessionId: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const engine = getSession(data.sessionId);
    if (!engine) return null;
    return engine.getSession();
  });

// List all active bot sessions
export const listBots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return getActiveSessions().map((e) => e.getSession());
  });

// Save a completed bot session as a meeting in the database
export const saveBotMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        sessionId: z.string(),
        sendEmail: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ws = await getOrCreateWorkspace(supabase, userId);

    // The session is already ended; re-fetch from the engine
    // In a real app, you'd persist sessions to DB; here we reconstruct
    // from the stopped engine's final state.
    //
    // For now, we create a meeting record manually using the session data
    // that was returned from stopBot.
    throw new Error(
      "Save meeting from bot session — implement persistence in bot engine first.",
    );
  });
