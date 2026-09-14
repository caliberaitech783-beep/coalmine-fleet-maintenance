import assert from "node:assert/strict";
import test from "node:test";
import {normalizeSessionMessage,SESSION_MESSAGE_MAX_LENGTH,sessionMessagePayloadValidationError,sessionMessageValidationError,validSessionMessageAudioDataUrl} from "../session-message.mjs";

test("session messages are trimmed, required, and short", () => {
  assert.equal(normalizeSessionMessage("  Check the vehicle status.  "),"Check the vehicle status.");
  assert.equal(sessionMessageValidationError("   "),"Write a message before sending.");
  assert.equal(sessionMessageValidationError("x".repeat(SESSION_MESSAGE_MAX_LENGTH)),"");
  assert.equal(sessionMessageValidationError("x".repeat(SESSION_MESSAGE_MAX_LENGTH+1)),`Keep the message within ${SESSION_MESSAGE_MAX_LENGTH} characters.`);
});

test("session messages accept a supported voice note with optional text", () => {
  const audioData = "data:audio/webm;base64,GkXfoA==";
  assert.equal(validSessionMessageAudioDataUrl(audioData),true);
  assert.equal(validSessionMessageAudioDataUrl("data:text/plain;base64,SGVsbG8="),false);
  assert.equal(sessionMessagePayloadValidationError({audioData}),"");
  assert.equal(sessionMessagePayloadValidationError({message:"Please review.",audioData}),"");
  assert.equal(sessionMessagePayloadValidationError({}),"Record a voice message or write a message before sending.");
});
