export const SESSION_MESSAGE_MAX_LENGTH = 500;
export const SESSION_MESSAGE_MAX_AUDIO_BYTES = 3 * 1024 * 1024;

export function normalizeSessionMessage(value = "") {
  return String(value ?? "").trim();
}

export function sessionMessageValidationError(value = "") {
  const message = normalizeSessionMessage(value);
  if (!message) return "Write a message before sending.";
  if (message.length > SESSION_MESSAGE_MAX_LENGTH) return `Keep the message within ${SESSION_MESSAGE_MAX_LENGTH} characters.`;
  return "";
}

export function validSessionMessageAudioDataUrl(value = "") {
  if (!value) return true;
  const match = String(value).match(/^data:audio\/(?:webm|ogg|mp4|mpeg|wav);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return false;
  const padding = match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0;
  return Math.floor((match[1].length * 3) / 4) - padding <= SESSION_MESSAGE_MAX_AUDIO_BYTES;
}

export function sessionMessagePayloadValidationError({message = "", audioData = ""} = {}) {
  const normalizedMessage = normalizeSessionMessage(message);
  if (!normalizedMessage && !audioData) return "Record a voice message or write a message before sending.";
  if (normalizedMessage.length > SESSION_MESSAGE_MAX_LENGTH) return `Keep the message within ${SESSION_MESSAGE_MAX_LENGTH} characters.`;
  if (!validSessionMessageAudioDataUrl(audioData)) return "Voice message must be a supported recording up to 3 MB.";
  return "";
}
