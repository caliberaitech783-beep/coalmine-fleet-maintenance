/**
 * Data housekeeping: what the Retention rules and Purge data pages can remove.
 * Only logs, delivery history, notifications and old photos/audio are listed;
 * business records (requests, equipment, tickets, masters) can never be purged
 * here. Each category counts and deletes rows older than a cutoff ($1).
 *
 * `retentionKey` links a category to the automatic daily clean-up setting of the
 * same meaning (log_retention in app_settings).
 */
export const HOUSEKEEPING_CATEGORIES = [
  {
    key: "audit", retentionKey: "auditDays", label: "Audit Trail",
    description: "Who did what and when. Older entries are only needed for past investigations.",
    tables: ["audit_events"],
    count: "SELECT COUNT(*)::int AS count FROM audit_events WHERE occurred_at<$1",
    purge: ["DELETE FROM audit_events WHERE occurred_at<$1"],
  },
  {
    key: "activity", retentionKey: "activityDays", label: "User activity",
    description: "Login history and session activity. Live sessions are never touched.",
    tables: ["user_login_history", "user_session_activity"],
    count: "SELECT (SELECT COUNT(*) FROM user_login_history WHERE last_seen_at<$1)+(SELECT COUNT(*) FROM user_session_activity WHERE last_seen_at<$1) AS count",
    purge: ["DELETE FROM user_login_history WHERE last_seen_at<$1", "DELETE FROM user_session_activity WHERE last_seen_at<$1"],
  },
  {
    key: "deliveries", retentionKey: "whatsappDays", label: "WhatsApp and Telegram delivery history",
    description: "One row per message per recipient, used to troubleshoot recent deliveries.",
    tables: ["whatsapp_alert_history"],
    count: "SELECT COUNT(*)::int AS count FROM whatsapp_alert_history WHERE created_at<$1",
    purge: ["DELETE FROM whatsapp_alert_history WHERE created_at<$1"],
  },
  {
    key: "notifications", retentionKey: "notificationDays", label: "In-app notifications",
    description: "Bell notifications, and direct messages the reader has already closed.",
    tables: ["crm_notifications", "session_messages"],
    count: "SELECT (SELECT COUNT(*) FROM crm_notifications WHERE created_at<$1)+(SELECT COUNT(*) FROM session_messages WHERE dismissed_at IS NOT NULL AND created_at<$1) AS count",
    purge: ["DELETE FROM crm_notifications WHERE created_at<$1", "DELETE FROM session_messages WHERE dismissed_at IS NOT NULL AND created_at<$1"],
  },
  {
    key: "media", retentionKey: "mediaDays", label: "Photos and audio on MIS-verified requests",
    description: "The largest data. Only requests MIS verified before the cutoff lose their photos and voice notes; the request, readings, remarks and history stay.",
    tables: ["maintenance_requests"],
    count: `SELECT COUNT(*)::int AS count FROM maintenance_requests WHERE verified_at IS NOT NULL AND verified_at<$1
      AND (complaint_audio<>'' OR complaint_media<>'[]'::jsonb OR maintenance_audio<>'' OR first_trip_card_image<>'')`,
    purge: [`UPDATE maintenance_requests SET complaint_audio='',complaint_media='[]'::jsonb,maintenance_audio='',first_trip_card_image=''
      WHERE verified_at IS NOT NULL AND verified_at<$1
        AND (complaint_audio<>'' OR complaint_media<>'[]'::jsonb OR maintenance_audio<>'' OR first_trip_card_image<>'')`],
  },
];

export const housekeepingCategory = (key) => HOUSEKEEPING_CATEGORIES.find((category) => category.key === key) || null;

/** The typed confirmation a purge needs, so a mis-click never deletes data. */
export const PURGE_CONFIRMATION = "DELETE";
export function purgeRequestError({category, reason, confirmation} = {}) {
  if (!housekeepingCategory(category)) return "Choose what to purge.";
  if (String(reason || "").trim().length < 5) return "Enter a reason for the purge (at least 5 characters). It is kept in the Audit Trail.";
  if (String(confirmation || "").trim().toUpperCase() !== PURGE_CONFIRMATION) return `Type ${PURGE_CONFIRMATION} to confirm the purge.`;
  return "";
}
