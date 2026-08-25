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
  assert.match(source, /const isProductionManager = session\?\.role === "super"[\s\S]*includes\("Production Manager"\)/);
  assert.match(source, /const canCreate = session\?\.role === "normal" \|\| isProductionManager/);
  assert.match(source, /function TicketCreateForm/);
  const createForm = source.slice(source.indexOf("function TicketCreateForm"), source.indexOf("function TicketAttachment"));
  assert.doesNotMatch(createForm, /User name|name="category"/);
  assert.match(createForm, /Priority \*[\s\S]*<option>Low<\/option><option>Medium<\/option><option>High<\/option>/);
  assert.match(createForm, /label="Description"/);
  assert.match(source, /EnhancedSpeechComplaint[\s\S]*messageAudio/);
  assert.match(source, /function TicketResolutionForm/);
  assert.match(source, /audioName="resolutionAudio"[\s\S]*Record resolution audio/);
  assert.match(source, /resolutionAttachmentData/);
  assert.match(source, /image\/jpeg,image\/png,image\/webp,video\/mp4,video\/webm/);
  assert.match(source, /function NotificationBell/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS crm_tickets/);
  assert.match(server, /resolution_audio TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /resolution_attachment_data TEXT NOT NULL DEFAULT ''/);
  assert.match(server, /priority TEXT NOT NULL DEFAULT 'Medium'/);
  assert.match(server, /Select a ticket priority/);
  assert.match(server, /CREATE TABLE IF NOT EXISTS crm_notifications/);
  assert.match(server, /app\.get\('\/api\/tickets',requireSession/);
  assert.match(server, /app\.patch\('\/api\/tickets\/resolve'/);
  assert.match(source, /fetch\("\/api\/tickets\/resolve"[\s\S]*reference: ticket\.reference/);
  assert.match(server, /\(@\$\{creatorLogin\}\) created ticket/);
  assert.match(source, /className="normal-header-nav"[\s\S]*<Ticket \/> Tickets/);
  assert.match(server, /Only an Admin can resolve tickets/);
  assert.match(server, /managerRoleSelection\([\s\S]*\.map\(managerUserRole\)/);
  assert.match(server, /managerRoles\.includes\('Production Manager'\)[\s\S]*managerUserRole\('Production Manager'\)/);
});
