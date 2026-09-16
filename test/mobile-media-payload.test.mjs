import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const media = readFileSync(new URL("../src/protected-media.jsx", import.meta.url), "utf8");
const pulse = readFileSync(new URL("../src/info-pulse-content.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

const between = (start, end) => server.slice(server.indexOf(start), server.indexOf(end, server.indexOf(start)));

test("request, ticket and Info Pulse list projections never embed media bodies", () => {
  const ticketProjection = between("function ticketProjection()", "function isTicketAdmin");
  assert.match(ticketProjection, /messageAudioAvailable/);
  assert.match(ticketProjection, /attachmentAvailable/);
  assert.match(ticketProjection, /resolutionAudioAvailable/);
  assert.doesNotMatch(ticketProjection, /AS "messageAudio"|AS "attachmentData"|AS "resolutionAudio"|AS "resolutionAttachmentData"/);

  const requestProjection = between("const requestProjection=", "function requestEquipmentNotificationDetails");
  assert.match(requestProjection, /complaintAudioAvailable/);
  assert.match(requestProjection, /maintenanceAudioAvailable/);
  assert.doesNotMatch(requestProjection, /AS "complaintAudio"|AS "maintenanceAudio"/);

  const infoRoute = between("app.get('/api/info-pulse'", "app.post('/api/info-pulse/prompt'");
  assert.match(infoRoute, /SELECT \$\{infoPulseProjection\}/);
  assert.doesNotMatch(infoRoute, /attachDailyRemarks|requestProjection/);
  assert.doesNotMatch(between("const infoPulseProjection=", "function requestEquipmentNotificationDetails"), /audio|media|file/i);
});

test("media is fetched only after an authenticated user action", () => {
  assert.match(server, /app\.get\('\/api\/requests\/:reference\/audio\/:kind',requireSession/);
  assert.match(server, /app\.get\('\/api\/tickets\/:reference\/media\/:kind',requireSession/);
  assert.match(server, /ticketVisibleToSession\(ticket,req\.session\)/);
  assert.match(server, /sendDataUrlMedia\(res,request\.data/);
  assert.match(media, /onClick=\{load\}/);
  assert.match(media, /headers: \{Authorization: `Bearer \$\{token\}`\}/);
  assert.match(media, /const blob = await response\.blob\(\)/);
  assert.match(main, /complaintAudioAvailable[\s\S]*<ProtectedAudio/);
  assert.doesNotMatch(main, /src=\{(?:row|r|request)\.(?:complaintAudio|maintenanceAudio)\}/);
});

test("compact lists use validators and expose their measured payload size", () => {
  const tickets = between("app.get('/api/tickets'", "const ticketMediaFields");
  assert.match(tickets, /sendPrivateJson\(req,res,'tickets',payload\)/);
  assert.match(server, /res\.set\('X-Payload-Bytes',String\(Buffer\.byteLength\(body\)\)\)/);
  assert.match(main, /"If-None-Match": responseEtag/);
  assert.match(main, /response\.status === 304/);
});

test("phone overlays and Info Pulse keep bounded work on screen", () => {
  assert.match(main, /setAlerts\(\(current\) => \[\.\.\.current, \.\.\.fresh\]\.slice\(-2\)\)/);
  assert.match(styles, /\.incoming-notification-stack\{[^}]*z-index:9000/);
  assert.match(styles, /\.overlay\.notification-entry-overlay\{z-index:21000\}/);
  assert.match(pulse, /const INITIAL_VISIBLE_ROWS = 24/);
  assert.match(pulse, /const visibleRows = shown\.slice\(0, rowLimit\)/);
  assert.match(pulse, /const \[filtersOpen, setFiltersOpen\] = useState\(false\)/);
});
