import assert from "node:assert/strict";
import test from "node:test";
import {normalizeSessionMessage,SESSION_MESSAGE_MAX_LENGTH,sessionMessageValidationError} from "../session-message.mjs";

test("session messages are trimmed, required, and short", () => {
  assert.equal(normalizeSessionMessage("  Check the vehicle status.  "),"Check the vehicle status.");
  assert.equal(sessionMessageValidationError("   "),"Write a message before sending.");
  assert.equal(sessionMessageValidationError("x".repeat(SESSION_MESSAGE_MAX_LENGTH)),"");
  assert.equal(sessionMessageValidationError("x".repeat(SESSION_MESSAGE_MAX_LENGTH+1)),`Keep the message within ${SESSION_MESSAGE_MAX_LENGTH} characters.`);
});
