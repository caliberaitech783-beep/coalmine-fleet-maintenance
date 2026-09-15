/**
 * Announcements: an Admin or Super Admin broadcasts a short text to every user.
 * Each user sees it as a blocking popup until they close it. Closing is
 * remembered per user (not per device), so it never reappears elsewhere.
 */
export const ANNOUNCEMENT_MAX_LENGTH = 500;
export const ANNOUNCEMENT_ACTIVE_DAYS = 30;

export function normalizeAnnouncement(value = "") {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

export function announcementValidationError(value = "") {
  const message = normalizeAnnouncement(value);
  if (!message) return "Write the announcement before sending.";
  if (message.length > ANNOUNCEMENT_MAX_LENGTH) return `Keep the announcement within ${ANNOUNCEMENT_MAX_LENGTH} characters.`;
  return "";
}

/** The key an acknowledgement is stored under: the login, or the name when a record has no login. */
export function announcementReaderKey(session = {}) {
  const login = String(session?.login || "").trim().toLowerCase();
  if (login) return login;
  return `name:${String(session?.name || "").trim().toLowerCase()}`;
}

/** Direct messages first (they name one person), then announcements, oldest first. */
export function inboxItems(messages = [], announcements = []) {
  return [
    ...(Array.isArray(messages) ? messages : []).map((item) => ({ ...item, kind: "message" })),
    ...(Array.isArray(announcements) ? announcements : []).map((item) => ({ ...item, kind: "announcement" })),
  ];
}

export function inboxDismissPath(item = {}) {
  const id = encodeURIComponent(String(item?.id ?? ""));
  return item?.kind === "announcement" ? `/api/announcements/${id}/acknowledge` : `/api/session-messages/${id}/dismiss`;
}
