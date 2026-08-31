import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  generatePasswordResetOtp,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_MAX_REQUESTS_PER_HOUR,
  PASSWORD_RESET_OTP_TTL_MINUTES,
  passwordResetValidationError,
  validPasswordResetOtp,
} from "../password-reset.mjs";

test("password reset OTPs are six digits and expire under bounded limits", () => {
  assert.equal(generatePasswordResetOtp(() => 42), "000042");
  assert.equal(generatePasswordResetOtp(() => 999999), "999999");
  assert.equal(validPasswordResetOtp("123456"), true);
  assert.equal(validPasswordResetOtp("12345"), false);
  assert.equal(validPasswordResetOtp("12345a"), false);
  assert.equal(PASSWORD_RESET_OTP_TTL_MINUTES, 10);
  assert.equal(PASSWORD_RESET_MAX_ATTEMPTS, 5);
  assert.equal(PASSWORD_RESET_MAX_REQUESTS_PER_HOUR, 5);
});

test("password reset validates confirmation and rejects the registered phone number", () => {
  assert.equal(passwordResetValidationError({password: "short", confirmation: "short"}), "The new password must contain at least 8 characters.");
  assert.equal(passwordResetValidationError({password: "new-password", confirmation: "different"}), "The password confirmation does not match.");
  assert.equal(passwordResetValidationError({password: "9925565281", confirmation: "9925565281", phone: "9925565281"}), "Choose a password different from your registered phone number.");
  assert.equal(passwordResetValidationError({password: "new-password", confirmation: "new-password", phone: "9925565281"}), "");
});

test("server stores only hashed OTPs and enforces expiry, attempts, rate limits, and session revocation", () => {
  const source = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const requestRoute = source.slice(source.indexOf("app.post('/api/password-reset/request'"), source.indexOf("app.post('/api/password-reset/confirm'"));
  const confirmRoute = source.slice(source.indexOf("app.post('/api/password-reset/confirm'"), source.indexOf("app.post('/api/change-initial-password'"));

  assert.match(source, /CREATE TABLE IF NOT EXISTS password_reset_sessions/);
  assert.match(requestRoute, /hashPassword\(otp\)/);
  assert.doesNotMatch(requestRoute, /otp_hash[^\n]*otp,/);
  assert.match(requestRoute, /NOW\(\)\+\(\$5::text\|\|' minutes'\)::interval/);
  assert.doesNotMatch(requestRoute, /recent\[0\].*resetToken/);
  assert.match(requestRoute, /PASSWORD_RESET_MAX_REQUESTS_PER_HOUR/);
  assert.match(requestRoute, /passwordResetRequestMessage,resetToken:fallbackToken/);
  assert.match(requestRoute, /UPDATE password_reset_sessions SET used_at=NOW\(\) WHERE master_record_id=\$1 AND used_at IS NULL/);
  assert.match(requestRoute, /Cache-Control','no-store/);
  assert.match(confirmRoute, /PASSWORD_RESET_MAX_ATTEMPTS/);
  assert.match(confirmRoute, /verifyPassword\(otp,reset\.otp_hash\)/);
  assert.match(confirmRoute, /DELETE FROM auth_sessions WHERE lower\(login_name\)=\$1/);
  assert.match(confirmRoute, /UPDATE password_reset_sessions SET used_at=NOW\(\) WHERE master_record_id=\$1/);
});

test("password reset is exposed only inside the login component", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const login = source.slice(source.indexOf("function Login"), source.indexOf("function Side"));
  const afterLogin = source.slice(source.indexOf("function Side"));

  assert.match(login, /className="login-auth-tabs"/);
  assert.match(login, />Reset password<\/button>/);
  assert.match(login, /\/api\/password-reset\/request/);
  assert.match(login, /\/api\/password-reset\/confirm/);
  assert.match(login, /autoComplete="one-time-code"/);
  assert.doesNotMatch(afterLogin, /login-auth-tabs|\/api\/password-reset\//);
});
