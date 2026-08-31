import {randomInt} from "node:crypto";

export const PASSWORD_RESET_OTP_TTL_MINUTES = 10;
export const PASSWORD_RESET_MAX_ATTEMPTS = 5;
export const PASSWORD_RESET_MAX_REQUESTS_PER_HOUR = 5;

export function generatePasswordResetOtp(randomIntImpl = randomInt) {
  return String(randomIntImpl(0, 1_000_000)).padStart(6, "0");
}

export function validPasswordResetOtp(value) {
  return /^\d{6}$/.test(String(value || "").trim());
}

export function passwordResetValidationError({password = "", confirmation = "", phone = ""} = {}) {
  if (String(password).length < 8) return "The new password must contain at least 8 characters.";
  if (password !== confirmation) return "The password confirmation does not match.";
  if (String(password).trim() === String(phone).trim()) return "Choose a password different from your registered phone number.";
  return "";
}
