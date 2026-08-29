import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Sends the complete meeting summary by email via the Resend API.
// Requires RESEND_API_KEY (server env) and an EMAIL_FROM address.

const severityColor: Record<string, string> = {
  low: "#16a34a",
  medium: "#d97706",
  high: "#dc2626",
};

const priorityColor: Record<string, string> = {
  low: "#64748b",
  medium: "#d97706",
  high: "#dc2626",
};

function escapeHtml(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rowBlock(
  icon: string,
  color: string,
  title: string,
  meta?: string,
  body?: string,
): string {
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eef0f3;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="width:36px;vertical-align:top;">
              <div style="width:28px;height:28px;border-radius:8px;background:${color}14;color:${color};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;">${icon}</div>
            </td>
            <td style="vertical-align:top;">
              <div style="font-family:Inter,Arial,sans-serif;font-size:14px;font-weight:600;color:#0f172a;">${title}</div>
              ${meta ? `<div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:${color};font-weight:600;margin-top:2px;">${meta}</div>` : ""}
              ${body ? `<div style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#475569;margin-top:4px;line-height:1.5;">${body}</div>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function section(title: string, rows: string): string {
  if (!rows) return "";
  return `
    <h2 style="font-family:Space Grotesk,Inter,Arial,sans-serif;font-size:16px;font-weight:700;color:#2563eb;margin:24px 0 8px;">${title}</h2>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

function buildEmailHtml(input: {
  meeting: any;
  projectName: string | null;
  transcript: string | null;
  segments: any[];
  actionItems: any[];
  decisions: any[];
  risks: any[];
  meetingUrl: string;
}): string {
  const { meeting, projectName, transcript, segments, actionItems, decisions, risks, meetingUrl } =
    input;

  const summaryBullets = (meeting.summary ?? "")
    .split("\n")
    .filter((b: string) => b.trim())
    .map((b: string) =>
      `<li style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#334155;line-height:1.6;margin:4px 0;">${escapeHtml(b.replace(/^[-•*]\s*/, ""))}</li>`,
    )
    .join("");

  const actionRows = actionItems
    .map((a: any) =>
      rowBlock(
        "✓",
        priorityColor[a.priority] ?? "#64748b",
        escapeHtml(a.title),
        [
          a.assignee_name ? `Assignee: ${escapeHtml(a.assignee_name)}` : "",
          a.due_date ? `Due: ${escapeHtml(a.due_date)}` : "",
          a.priority ? `Priority: ${escapeHtml(a.priority)}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
        a.description ? escapeHtml(a.description) : undefined,
      ),
    )
    .join("");

  const decisionRows = decisions
    .map((d: any) =>
      rowBlock(
        "✓",
        "#059669",
        escapeHtml(d.statement),
        (d.tags ?? []).map(escapeHtml).join(" · ") || undefined,
        d.context ? escapeHtml(d.context) : undefined,
      ),
    )
    .join("");

  const riskRows = risks
    .map((r: any) =>
      rowBlock(
        "!",
        severityColor[r.severity] ?? "#64748b",
        escapeHtml(r.description),
        [r.category ? `Category: ${escapeHtml(r.category)}` : "", `Severity: ${escapeHtml(r.severity)}`]
          .filter(Boolean)
          .join(" · "),
        r.mitigation ? `Mitigation: ${escapeHtml(r.mitigation)}` : undefined,
      ),
    )
    .join("");

  const transcriptPreview = transcript
    ? escapeHtml(transcript.slice(0, 2000)) + (transcript.length > 2000 ? "…" : "")
    : "";

  const metaLine = [
    projectName ? `<strong>${escapeHtml(projectName)}</strong>` : "",
    meeting.scheduled_at
      ? new Date(meeting.scheduled_at).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "",
    meeting.duration_seconds
      ? `${Math.round(meeting.duration_seconds / 60)} min`
      : "",
  ]
    .filter(Boolean)
    .join(" &nbsp;·&nbsp; ");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px;background:linear-gradient(135deg,#2563eb,#7c3aed);">
            <div style="font-family:Space Grotesk,Inter,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:1px;color:#c7d2fe;text-transform:uppercase;">AI Meeting Operator</div>
            <div style="font-family:Space Grotesk,Inter,Arial,sans-serif;font-size:24px;font-weight:700;color:#ffffff;margin-top:8px;">${escapeHtml(meeting.title)}</div>
            <div style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#e0e7ff;margin-top:6px;">${metaLine}</div>
          </td>
        </tr>
        <tr><td style="padding:8px 32px 28px;">
          ${summaryBullets ? `<h2 style="font-family:Space Grotesk,Inter,Arial,sans-serif;font-size:16px;font-weight:700;color:#2563eb;margin:24px 0 4px;">Summary</h2><ul style="margin:8px 0 0;padding-left:20px;">${summaryBullets}</ul>` : ""}
          ${section("Action items", actionRows)}
          ${section("Decisions", decisionRows)}
          ${section("Risks", riskRows)}
          ${transcriptPreview ? `
            <h2 style="font-family:Space Grotesk,Inter,Arial,sans-serif;font-size:16px;font-weight:700;color:#2563eb;margin:24px 0 4px;">Transcript preview</h2>
            <div style="font-family:Inter,Arial,sans-serif;font-size:13px;color:#475569;line-height:1.6;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;white-space:pre-wrap;">${transcriptPreview}</div>` : ""}
          ${segments.length ? `<div style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#94a3b8;margin-top:8px;">${segments.length} timestamped segments with speaker labels.</div>` : ""}
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
            <tr><td>
              <a href="${escapeHtml(meetingUrl)}" style="font-family:Inter,Arial,sans-serif;display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;">Open full meeting notes</a>
            </td></tr>
          </table>
        </td></tr>
        <tr>
          <td style="padding:18px 32px;border-top:1px solid #eef0f3;font-family:Inter,Arial,sans-serif;font-size:12px;color:#94a3b8;text-align:center;">
            Generated by AI Meeting Operator · ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const emailMeetingDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        meetingId: z.string().uuid(),
        toEmail: z.string().email().optional(),
        baseUrl: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, claims } = context;
    const recipient = data.toEmail || (claims as any)?.email;
    if (!recipient) throw new Error("No recipient email available for your account");

    const { data: meeting, error } = await supabase
      .from("meetings")
      .select("*, projects(id, name)")
      .eq("id", data.meetingId)
      .single();
    if (error) throw new Error(error.message);

    const [transcriptRes, actionItemsRes, decisionsRes, risksRes, segmentsRes] = await Promise.all([
      supabase.from("transcripts").select("content").eq("meeting_id", data.meetingId).maybeSingle(),
      supabase.from("action_items").select("*").eq("meeting_id", data.meetingId).order("created_at"),
      supabase.from("decisions").select("*").eq("meeting_id", data.meetingId).order("created_at"),
      supabase.from("risks").select("*").eq("meeting_id", data.meetingId).order("severity"),
      supabase
        .from("transcript_segments")
        .select("*")
        .eq("meeting_id", data.meetingId)
        .order("seq", { ascending: true }),
    ]);

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("Email is not configured (missing RESEND_API_KEY)");

    const from = process.env.EMAIL_FROM?.trim() || "AI Meeting Operator <meetings@resend.dev>";
    const base = (data.baseUrl || process.env.VITE_APP_URL || "").replace(/\/$/, "");
    const meetingUrl = base ? `${base}/meetings/${data.meetingId}` : "";

    const html = buildEmailHtml({
      meeting,
      projectName: (meeting as any).projects?.name ?? null,
      transcript: transcriptRes.data?.content ?? null,
      segments: segmentsRes.data ?? [],
      actionItems: actionItemsRes.data ?? [],
      decisions: decisionsRes.data ?? [],
      risks: risksRes.data ?? [],
      meetingUrl,
    });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: `Meeting notes: ${meeting.title}`,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Email send failed (${response.status}): ${body.slice(0, 300)}`);
    }

    return { ok: true, to: recipient };
  });
