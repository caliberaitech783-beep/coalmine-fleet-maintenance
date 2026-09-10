export const SESSION_MESSAGE_MAX_LENGTH = 500;

export function normalizeSessionMessage(value = "") {
  return String(value ?? "").trim();
}

export function sessionMessageValidationError(value = "") {
  const message = normalizeSessionMessage(value);
  if (!message) return "Write a message before sending.";
  if (message.length > SESSION_MESSAGE_MAX_LENGTH) return `Keep the message within ${SESSION_MESSAGE_MAX_LENGTH} characters.`;
  return "";
}
