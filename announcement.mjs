/**
 * Announcements: an Admin or Super Admin broadcasts a short text to every user.
 * Each user sees it as a blocking popup until they close it. Closing is
 * remembered per user (not per device), so it never reappears elsewhere.
 */
export const ANNOUNCEMENT_MAX_LENGTH = 2000;
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

function addReaderKey(keys, value, prefix = "") {
  const key = String(value || "").trim().toLowerCase();
  if (key && !keys.includes(`${prefix}${key}`)) keys.push(`${prefix}${key}`);
}

/** All durable keys this session may be known by, newest first. */
export function announcementReaderKeys(session = {}) {
  const keys = [];
  addReaderKey(keys, session?.login);
  addReaderKey(keys, session?.username);
  addReaderKey(keys, session?.userLogin);
  addReaderKey(keys, session?.loginName);
  addReaderKey(keys, session?.name, "name:");
  if (!keys.length) addReaderKey(keys, session?.sessionId, "session:");
  return keys.length ? keys : ["session:anonymous"];
}

/** The primary key an acknowledgement is stored under. */
export function announcementReaderKey(session = {}) {
  return announcementReaderKeys(session)[0];
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
