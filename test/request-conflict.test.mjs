import test from "node:test";
import assert from "node:assert/strict";
import {
  activeRequestConflictMessage,
  findActiveRequestConflict,
  isActiveMaintenanceRequest,
} from "../request-conflict.mjs";

test("active requests conflict on a normalized door number", () => {
  const request = {ref: "REQ-100", door: "  MH-40 ", chassis: "CH-1", status: "Open"};

  assert.equal(findActiveRequestConflict([request], {door: "mh-40"}), request);
});

test("closed requests do not prevent a new request", () => {
  const closed = {ref: "REQ-101", door: "D-12", chassis: "CH-2", status: "Closed"};

  assert.equal(isActiveMaintenanceRequest(closed), false);
  assert.equal(findActiveRequestConflict([closed], {door: "D-12", chassis: "CH-2"}), null);
});

test("chassis matching protects the same asset when a door value differs", () => {
  const request = {ref: "REQ-102", door: "OLD-7", chassis: "CHASSIS-7", status: "Idle"};

  assert.equal(findActiveRequestConflict([request], {door: "NEW-7", chassis: " chassis-7 "}), request);
});

test("conflict message identifies the door and active request", () => {
  assert.equal(
    activeRequestConflictMessage({ref: "REQ-103", door: "D-22"}),
    "Door D-22 is already off road / under maintenance under request REQ-103. A second request cannot be created until the active request is closed.",
  );
});
