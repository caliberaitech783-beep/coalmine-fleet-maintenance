import assert from "node:assert/strict";
import test from "node:test";
import {requestDateTimeValue, requestMayBeChanged, requestMayBeVerified, validRequestAudioDataUrl, validTripCardImageDataUrl} from "../request-workflow.mjs";

test("accepts a complete India date and time for request workflow actions", () => {
  assert.equal(requestDateTimeValue("2026-08-14", "14:30:10")?.toISOString(), "2026-08-14T09:00:10.000Z");
  assert.equal(requestDateTimeValue("2026-08-14", "14:30"), null);
});

test("locks verified and closed requests from normal edits", () => {
  assert.equal(requestMayBeChanged({status: "Open"}), true);
  assert.equal(requestMayBeChanged({status: "Closed"}), false);
  assert.equal(requestMayBeChanged({verifiedAt: "2026-08-14 14:00"}), false);
});

test("only unverified closed requests are ready for MIS verification", () => {
  assert.equal(requestMayBeVerified({status: "Open"}), false);
  assert.equal(requestMayBeVerified({status: "Closed"}), true);
  assert.equal(requestMayBeVerified({status: "Closed", verifiedAt: "2026-08-14 14:00"}), false);
});

test("accepts supported trip-card images and rejects invalid attachments", () => {
  assert.equal(validTripCardImageDataUrl("data:image/jpeg;base64,/9j/2Q=="), true);
  assert.equal(validTripCardImageDataUrl("data:image/png;base64,iVBORw=="), true);
  assert.equal(validTripCardImageDataUrl("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(validTripCardImageDataUrl("not-an-image"), false);
});

test("accepts supported request audio and rejects unsafe audio data", () => {
  assert.equal(validRequestAudioDataUrl("data:audio/webm;base64,GkXfoA=="), true);
  assert.equal(validRequestAudioDataUrl("data:audio/mpeg;base64,SUQzBA=="), true);
  assert.equal(validRequestAudioDataUrl("data:text/plain;base64,SGVsbG8="), false);
});
