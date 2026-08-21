import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {managerUserRole,ticketReference,ticketSiteSlug,validTicketMediaDataUrl} from "../ticket-workflow.mjs";

test("ticket references use site and DDMMYY with a generated sequence", () => {
  const reference = ticketReference({site: "Majri OB", date: new Date(2026, 7, 21), number: 42});
  assert.equal(reference, "TIC/MAJRI-OB/210826/000042");
  assert.equal(ticketSiteSlug(" Lingaraj Siding "), "LINGARAJ-SIDING");
});

test("manager roles map to their managed mobile-user role", () => {
  assert.equal(managerUserRole("Production Manager"), "Production User");
  assert.equal(managerUserRole("Maintenance Manager"), "Maintenance User");
  assert.equal(managerUserRole("MIS Manager"), "MIS User");
});

test("ticket media accepts supported bounded data URLs", () => {
  assert.equal(validTicketMediaDataUrl("data:audio/webm;base64,YQ==", {kind: "audio"}), true);
  assert.equal(validTicketMediaDataUrl("data:image/png;base64,YQ=="), true);
  assert.equal(validTicketMediaDataUrl("data:video/mp4;base64,YQ=="), true);
  assert.equal(validTicketMediaDataUrl("data:text/html;base64,YQ=="), false);
});

test("ticket UI and API enforce scoped lists, admin resolution, and notifications", () => {
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /function TicketPage/);
  assert.match(source, /function TicketCreateForm/);
  assert.match(source, /EnhancedSpeechComplaint[\s\S]*messageAudio/);
  assert.match(source, /image\/jpeg,image\/png,image\/webp,video\/mp4,video\/webm/);
  assert.match(source, /function NotificationBell/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS crm_tickets/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS crm_notifications/);
  assert.match(server, /app\.get\('\/api\/tickets',requireSession/);
  assert.match(server, /app\.patch\('\/api\/tickets\/resolve'/);
  assert.match(source, /fetch\("\/api\/tickets\/resolve"[\s\S]*reference: resolving\.reference/);
  assert.match(source, /className="normal-header-nav"[\s\S]*<Ticket \/> Tickets/);
  assert.match(server, /Only an Admin can resolve tickets/);
  assert.match(server, /managerUserRole\(req\.session\.permissions\?\.managerRole\)/);
});
