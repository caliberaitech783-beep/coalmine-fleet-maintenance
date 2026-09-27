/**
 * Admin > Database > Storage management: plain names for the database tables
 * and the rules that turn sizes into a status. The route in server.mjs reads
 * the numbers; everything here is pure so it can be tested without Postgres.
 */
export const TABLE_LABELS = Object.freeze({
  maintenance_requests: "Breakdown requests (with photos and audio)",
  maintenance_daily_remarks: "Daily maintenance remarks",
  master_records: "Masters (equipment, users, C-Dir and others)",
  audit_events: "Audit Trail",
  user_login_history: "Login history",
  user_session_activity: "Session activity",
  auth_sessions: "Signed-in sessions",
  whatsapp_alert_history: "WhatsApp and Telegram delivery history",
  whatsapp_workflow_dispatches: "WhatsApp workflow messages sent",
  whatsapp_consolidated_report_runs: "WhatsApp report runs",
  crm_notifications: "In-app notifications",
  crm_tickets: "Tickets",
  session_messages: "Direct messages",
  announcements: "Announcements (with images)",
  announcement_acknowledgements: "Announcement read receipts",
  backup_runs: "Backup history",
  data_revisions: "Record change history",
  request_corrections: "Request corrections",
  published_reports: "Published reports",
  saved_table_reports: "Saved report layouts",
  text_translations: "Translation cache",
  production_first_trip_acceptances: "First trip acceptances",
  remote_assistance_sessions: "Remote assistance sessions",
  remote_assistance_event_batches: "Remote assistance recordings",
  remote_assistance_commands: "Remote assistance commands",
  audit_log_export_runs: "Audit Trail export runs",
  audit_log_export_deliveries: "Audit Trail export deliveries",
  info_pulse_prompts: "Info Pulse prompts",
  telegram_user_links: "Telegram connections",
  telegram_link_tokens: "Telegram connect links",
  admin_lock_incidents: "Admin lock incidents",
  password_change_sessions: "Password change steps",
  password_reset_sessions: "Password reset steps",
  app_settings: "Settings",
  app_metadata: "System markers",
});

/** Tables whose old rows Purge data / Retention rules can remove. */
export const PURGEABLE_TABLES = Object.freeze(new Set([
  "audit_events", "user_login_history", "user_session_activity", "whatsapp_alert_history",
  "crm_notifications", "session_messages", "maintenance_requests",
]));

export const tableLabel = (name) => TABLE_LABELS[name] || String(name || "").replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

/** Share of the whole, as a percentage with one decimal (0 when the whole is 0). */
export const sharePercent = (part, whole) => (Number(whole) > 0 ? Math.round((Number(part) / Number(whole)) * 1000) / 10 : 0);

/**
 * Status of the disk that holds backups: warn at 80% used, fail at 90%.
 * Returns "off" when the size is unknown (for example statfs is unsupported).
 */
export function diskState(totalBytes, freeBytes) {
  const total = Number(totalBytes), free = Number(freeBytes);
  if (!(total > 0) || !(free >= 0)) return { status: "off", usedPercent: null };
  const usedPercent = sharePercent(total - free, total);
  return { status: usedPercent >= 90 ? "fail" : usedPercent >= 80 ? "warn" : "ok", usedPercent };
}

/**
 * Space Postgres has freed but not yet reused. Rows deleted by a purge leave
 * this behind; autovacuum makes it reusable, so it only matters when large.
 * Statistics are empty for a while after a database restart (no live rows
 * counted yet), so nothing is reported until live rows have been counted.
 */
export function deadRowShare(liveRows, deadRows) {
  const live = Math.max(0, Number(liveRows) || 0), dead = Math.max(0, Number(deadRows) || 0);
  return live ? sharePercent(dead, live + dead) : 0;
}
