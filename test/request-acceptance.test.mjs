import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { REQUEST_ACCEPTANCE_DELAY_MS, requestAwaitingAcceptance } from "../request-acceptance.mjs";

test("unaccepted requests are highlighted one hour after production timing", () => {
  const start = "2026-09-07 10:00";
  const productionEpoch = Date.parse("2026-09-07T10:00:00+05:30");
  assert.equal(requestAwaitingAcceptance({ start, status: "Open" }, productionEpoch + REQUEST_ACCEPTANCE_DELAY_MS - 1), false);
  assert.equal(requestAwaitingAcceptance({ start, status: "Open" }, productionEpoch + REQUEST_ACCEPTANCE_DELAY_MS), true);
  assert.equal(requestAwaitingAcceptance({ start, status: "Open", acceptedAt: "2026-09-07 11:00" }, productionEpoch + REQUEST_ACCEPTANCE_DELAY_MS * 2), false);
  assert.equal(requestAwaitingAcceptance({ start, status: "Closed" }, productionEpoch + REQUEST_ACCEPTANCE_DELAY_MS * 2), false);
});

test("Maintenance acceptance is server timed and shared by every request view", () => {
  const client = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(client, /Production timing \(HH:MM:SS\)/);
  assert.match(client, /<label>Acceptance timing/);
  assert.match(client, /Accept vehicle <ChevronRight/);
  assert.equal(client.match(/className=\{requestAwaitingAcceptance\(/g)?.length, 2);
  assert.match(server, /ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ/);
  assert.match(server, /accepted_at=COALESCE\(accepted_at,NOW\(\)\)/);
  assert.match(server, /AS "acceptedAt"/);
});
