import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../src/theme.css", import.meta.url), "utf8");
const bell = source.slice(source.indexOf("function NotificationBell("), source.indexOf("function Normal("));
const openEntry = bell.slice(bell.indexOf("const openEntry ="), bell.indexOf("useEffect(() => () =>"));

test("a notification click resolves its exact authorized target by notification id", () => {
  assert.match(openEntry, /setOpen\(false\)/);
  assert.match(openEntry, /fetch\(`\/api\/notifications\/\$\{encodeURIComponent\(notificationId\)\}\/target`/);
  assert.match(openEntry, /method: "GET"/);
  assert.match(openEntry, /cache: "no-store"/);
  assert.match(openEntry, /Authorization: `Bearer \$\{session\.token\}`/);
  assert.doesNotMatch(openEntry, /item\?\.message|item\.message|ticketReference|startsWith\(/);
});

test("target loading is abortable and ignores stale click responses", () => {
  assert.match(bell, /entryControllerRef\.current\?\.abort\(\)/);
  assert.match(bell, /window\.requestAnimationFrame\(\(\) => triggerRef\.current\?\.focus\(\)\)/);
  assert.match(openEntry, /const sequence = \+\+entrySequenceRef\.current/);
  assert.match(openEntry, /signal: controller\.signal/);
  assert.match(openEntry, /if \(sequence !== entrySequenceRef\.current\) return/);
  assert.match(openEntry, /error\.name === "AbortError" \|\| sequence !== entrySequenceRef\.current/);
  assert.match(bell, /entrySequenceRef\.current \+= 1;[\s\S]*entryControllerRef\.current\?\.abort\(\)/);
});

test("the exact entry dialog has accessible loading, generic error, request, and ticket states", () => {
  const dialog = source.slice(source.indexOf("function NotificationEntryField("), source.indexOf("function NotificationBell("));
  assert.match(dialog, /function NotificationEntryDialog/);
  assert.match(dialog, /createPortal\(<Modal[\s\S]*className="notification-entry-modal"/);
  assert.match(dialog, /role="status"[\s\S]*aria-live="polite"[\s\S]*aria-busy="true"/);
  assert.match(dialog, /role="alert"/);
  assert.match(dialog, /This entry is no longer available or is outside your assigned access\./);
  assert.match(dialog, /target\?\.kind === "request"[\s\S]*<NotificationRequestEntry/);
  assert.match(dialog, /target\?\.kind === "ticket"[\s\S]*<NotificationTicketEntry/);
  assert.match(dialog, /<MaintenanceRemarks remarks=\{request\.dailyRemarks\}/);
  assert.match(dialog, /request\.openingMeterFileUploaded \? "Evidence uploaded"/);
  assert.doesNotMatch(dialog, /<MeterFileCell/);
  assert.match(dialog, /<TicketAttachment ticket=\{ticket\}/);
  assert.match(dialog, /<TicketMedia data=\{ticket\.resolutionAttachmentData\}/);
});

test("only a validated server kind drives broad navigation after the dialog opens", () => {
  assert.match(openEntry, /\["request", "ticket"\]\.includes\(kind\)/);
  assert.match(openEntry, /setEntryState\(\{phase: "ready", target\}\);[\s\S]*onOpenEntryRef\.current\?\.\(target\)/);
  assert.equal(source.match(/<NotificationBell\b/g)?.length, 2);
  const uses = source.split(/\r?\n/).filter((line) => line.includes("<NotificationBell"));
  assert.equal(uses.length, 2);
  for (const use of uses) {
    assert.match(use, /onOpenEntry=/);
    assert.match(use, /target\?\.kind === "ticket"|target\?\.kind==="ticket"/);
    assert.doesNotMatch(use, /startsWith\(|ticketReference|\.message/);
  }
});

test("the read-only entry dialog is responsive and dark-theme compatible", () => {
  assert.match(styles, /\.notification-entry-modal\{[^}]*width:min\(920px,calc\(100vw - 32px\)\)/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.notification-entry-modal\{[^}]*100dvh/);
  assert.match(styles, /@media\(max-width:520px\)[\s\S]*\.notification-entry-fields\{grid-template-columns:1fr\}/);
  assert.match(styles, /\.notification-entry-audio audio\{[^}]*width:100%/);
  assert.match(theme, /data-theme="dark"[^\n]*\.notification-entry-hero/);
  assert.match(theme, /data-theme="dark"[^\n]*\.notification-entry-fields>div/);
});
