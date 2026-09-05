import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readApiJson } from "../src/api-response.mjs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("Breakdown Master status tabs select and filter the table", () => {
  const breakdown = source.slice(
    source.indexOf("Breakdown = function BreakdownWithMasterEntry"),
    source.indexOf("const OriginalEquipment"),
  );
  assert.match(breakdown, /const \[statusFilter, setStatusFilter\] = useState\("all"\)/);
  assert.match(breakdown, /const filteredRows = statusFilter === "all"[\s\S]*record\.status/);
  assert.match(breakdown, /role="tablist" aria-label="Breakdown request status"/);
  assert.match(breakdown, /type="button"[\s\S]*role="tab"[\s\S]*aria-selected=\{statusFilter === value\}/);
  assert.match(breakdown, /onClick=\{\(\) => setStatusFilter\(value\)\}/);
  assert.match(breakdown, /<BreakdownTable rows=\{filteredRows\}/);
});

test("same-count request updates refresh the operational dashboard data", () => {
  const normal = source.slice(source.indexOf("function Normal("), source.indexOf("function App("));
  assert.match(normal, /const controller = new AbortController\(\)/);
  assert.match(normal, /signal:controller\.signal/);
  assert.match(normal, /\},\[session\?\.token,requests\]\)/);
  assert.doesNotMatch(normal, /\},\[session\?\.token,requests\.length\]\)/);
});

test("Region Master search reconciles the selected site with visible tabs", () => {
  const region = source.slice(source.indexOf("function RegionMasterPage"), source.indexOf("Generic = function GenericWithMasters"));
  assert.match(region, /const visibleSites = .*filter\(\(site\) => matchesSmartSearch/);
  assert.match(region, /const nextSite = visibleSites\.includes\(activeSite\) \? activeSite : visibleSites\[0\] \|\| ""/);
  assert.match(region, /if \(nextSite !== activeSite\) setActiveSite\(nextSite\)/);
  assert.match(region, /visibleSites\.join\("\|"\)/);
});

test("shared modal traps focus, supports Escape, locks scrolling and restores focus", () => {
  const modal = source.slice(source.indexOf("function Modal("), source.indexOf("function requestStartParts"));
  assert.match(modal, /const dialogRef = useRef\(null\)/);
  assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(modal, /event\.key !== "Tab"/);
  assert.match(modal, /document\.activeElement === last/);
  assert.match(modal, /document\.body\.style\.overflow = previousOverflow/);
  assert.match(modal, /previousFocus\?\.isConnected/);
  assert.match(modal, /ref=\{dialogRef\} tabIndex=\{-1\}/);
});

test("equipment detail rows support keyboard activation without hijacking child buttons", () => {
  const equipment = source.slice(source.indexOf("function Equipment("), source.indexOf("function Breakdown("));
  assert.match(equipment, /event\.target !== event\.currentTarget/);
  assert.match(equipment, /\["Enter", " "\]\.includes\(event\.key\)/);
  assert.match(equipment, /event\.preventDefault\(\);[\s\S]*setDetail\(v\)/);
  assert.match(equipment, /tabIndex=\{0\}[\s\S]*aria-haspopup="dialog"[\s\S]*aria-label=\{`View details/);
});

test("authentication responses hide non-JSON proxy bodies behind useful errors", async () => {
  await assert.rejects(
    readApiJson(new Response("<html>Bad gateway</html>", { status: 502 }), "Could not sign in."),
    (error) => error.message === "Could not sign in. (HTTP 502)" && !error.message.includes("html"),
  );
  await assert.rejects(
    readApiJson(new Response(JSON.stringify({ error: "Credentials rejected" }), { status: 401 }), "Could not sign in."),
    /Credentials rejected/,
  );
  assert.deepEqual(
    await readApiJson(new Response(JSON.stringify({ token: "safe-token" }), { status: 200 }), "Could not sign in."),
    { token: "safe-token" },
  );
  const login = source.slice(source.indexOf("function Login("), source.indexOf("function Side("));
  assert.equal(login.match(/readApiJson\(response,/g)?.length, 4);
});

test("notification failures retain existing items and never acknowledge unread items", () => {
  const bell = source.slice(source.indexOf("function NotificationBell("), source.indexOf("function Normal("));
  assert.match(bell, /if \(!response\.ok\) throw new Error\(`Could not load notifications/);
  assert.match(bell, /if \(Array\.isArray\(next\)\) setItems\(next\)/);
  assert.doesNotMatch(bell, /response\.ok \? response\.json\(\) : \[\]/);
  assert.match(bell, /if \(!response\.ok\) throw new Error\(`Could not mark notifications as read/);
  assert.match(bell, /setItems\(\(current\) => current\.map/);
  assert.match(bell, /document\.addEventListener\("pointerdown", closeOutside\)/);
  assert.match(bell, /event\.key !== "Escape"/);
  assert.match(bell, /triggerRef\.current\?\.focus\(\)/);
});

test("rapid ticket filters and request refreshes cannot apply stale responses", () => {
  const tickets = source.slice(source.indexOf("function TicketPage("), source.indexOf("const AI_FEEDER_AUTO_CLOSE_SECONDS"));
  assert.match(tickets, /const controller = new AbortController\(\)/);
  assert.match(tickets, /signal: controller\.signal/);
  assert.match(tickets, /activeRequest && error\.name !== "AbortError"/);
  assert.match(tickets, /controller\.abort\(\)/);

  const app = source.slice(source.indexOf("function App("));
  assert.match(app, /const requestLoadSequence = useRef\(0\)/);
  assert.match(app, /const loadSequence = \+\+requestLoadSequence\.current/);
  assert.match(app, /if \(loadSequence === requestLoadSequence\.current\) setRequests\(data\)/);
  assert.match(app, /stopped = true;\s*requestLoadSequence\.current \+= 1;/);
  const mutations = app.slice(app.indexOf("addRequest = async"), app.indexOf("const completeLogin"));
  assert.ok((mutations.match(/requestLoadSequence\.current \+= 1;/g) || []).length >= 6);
  assert.match(mutations, /requestLoadSequence\.current \+= 1;\s*setRequests\(\(current\) => current\.map/);
  assert.match(mutations, /requestLoadSequence\.current \+= 1;\s*setRequests\(\(current\) => current\.filter/);
});
