import nodemailer from "nodemailer";

export const cleanEmailText = (value) => String(value ?? "").trim();
export const escapeEmailHtml = (value) => cleanEmailText(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const clean = cleanEmailText;
const escapeHtml = escapeEmailHtml;

export function ticketEmailConfiguration(env = process.env) {
  const user = clean(env.GMAIL_USER || "breakdown.cmll@gmail.com");
  const appPassword = clean(env.GMAIL_APP_PASSWORD).replace(/\s+/g, "");
  const host = clean(env.SMTP_HOST || "smtp.gmail.com");
  const port = Number(env.SMTP_PORT || 587);
  const secure = String(env.SMTP_SECURE || "false").toLowerCase() === "true";
  const recipients = clean(env.TICKET_EMAIL_TO || user)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return {user, appPassword, host, port, secure, recipients, configured: Boolean(user && appPassword && host && port && recipients.length)};
}

export function createTicketMailer(env = process.env) {
  const config = ticketEmailConfiguration(env);
  if (!config.configured) return {config, transporter: null};
  return {
    config,
    transporter: nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: !config.secure,
      auth: {user: config.user, pass: config.appPassword},
    }),
  };
}

export async function sendTicketRaisedEmail(ticket, env = process.env) {
  const {config, transporter} = createTicketMailer(env);
  if (!transporter) return {sent: false, reason: "Gmail is not configured"};
  const reference = clean(ticket.reference || "New ticket");
  const createdBy = `${clean(ticket.creatorName || "User")} (@${clean(ticket.creatorLogin || "unknown")})`;
  const details = [
    ["Ticket ID", reference],
    ["Raised by", createdBy],
    ["User role", ticket.creatorRole],
    ["Site", ticket.site],
    ["Category", ticket.category],
    ["Priority", ticket.priority],
    ["Created at", ticket.createdAt],
    ["Description", ticket.message || (ticket.messageAudio ? "Audio description attached in the application" : "—")],
    ["Audio", ticket.messageAudio ? "Available in the Tickets screen" : "No"],
    ["Image/video", ticket.attachmentData ? `Available in the Tickets screen${ticket.attachmentName ? ` (${ticket.attachmentName})` : ""}` : "No"],
  ];
  const rows = details.map(([label, value]) => `<tr><th style="padding:8px 12px;text-align:left;background:#f4f7fb;border:1px solid #dbe3ef">${escapeHtml(label)}</th><td style="padding:8px 12px;border:1px solid #dbe3ef">${escapeHtml(value || "—")}</td></tr>`).join("");
  const result = await transporter.sendMail({
    from: `Nerve Center Tickets <${config.user}>`,
    to: config.recipients,
    subject: `[${clean(ticket.priority || "Medium")}] New ticket ${reference} — ${clean(ticket.site || "Unassigned site")}`,
    text: details.map(([label, value]) => `${label}: ${clean(value || "—")}`).join("\n"),
    html: `<div style="font-family:Arial,sans-serif;color:#10213d"><h2>New support ticket raised</h2><table style="border-collapse:collapse;width:100%;max-width:720px">${rows}</table><p style="color:#66758d">Open Nerve Center → Tickets to review the complete ticket and its media.</p></div>`,
  });
  return {sent: true, messageId: result.messageId, accepted: result.accepted};
}
