import test from "node:test";
import assert from "node:assert/strict";
import {ticketEmailConfiguration} from "../ticket-email.mjs";

test("ticket email uses the configured Gmail account and recipients", () => {
  const config = ticketEmailConfiguration({
    GMAIL_USER: "breakdown.cmll@gmail.com",
    GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
    TICKET_EMAIL_TO: "breakdown.cmll@gmail.com, manager@example.com",
  });
  assert.equal(config.configured, true);
  assert.equal(config.appPassword, "abcdefghijklmnop");
  assert.deepEqual(config.recipients, ["breakdown.cmll@gmail.com", "manager@example.com"]);
});

test("ticket email remains disabled until an app password is configured", () => {
  const config = ticketEmailConfiguration({GMAIL_USER: "breakdown.cmll@gmail.com"});
  assert.equal(config.configured, false);
});
