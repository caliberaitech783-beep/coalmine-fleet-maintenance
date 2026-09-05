import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compatibilityStyles = readFileSync(new URL("../src/mobile-compat.css", import.meta.url), "utf8");
const workflowStyles = readFileSync(new URL("../src/mobile-workflow.css", import.meta.url), "utf8");
const dashboardStyles = readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");

test("dark generic modal headers retain a dark surface and readable close control", () => {
  assert.match(
    compatibilityStyles,
    /:root\[data-theme="dark"\] \.modal:not\(\.director-timing-modal\):not\(\.report-zip-modal\) > header\s*\{[^}]*background:\s*#241d27;[^}]*color:\s*var\(--ink\);/s,
  );
  assert.match(
    compatibilityStyles,
    /:root\[data-theme="dark"\] \.modal:not\(\.director-timing-modal\):not\(\.report-zip-modal\) > header button\s*\{[^}]*color:\s*#c5d0df;/s,
  );
  assert.doesNotMatch(compatibilityStyles, /:root\[data-theme="dark"\] \.modal > header/);
});

test("fine-pointer desktop workflow tables expose their vertical scrollbar", () => {
  assert.match(
    workflowStyles,
    /@media \(hover:\s*hover\) and \(pointer:\s*fine\)\s*\{[\s\S]*?\.normal \.scroll\.mobile-workflow-table::-webkit-scrollbar:vertical\s*\{[^}]*width:\s*12px/s,
  );
});

test("dashboard feature charts stack before their two-column plots can clip", () => {
  assert.match(
    dashboardStyles,
    /@media \(max-width:\s*1180px\)\s*\{\s*\.mine-dashboard-feature-row\s*\{\s*grid-template-columns:\s*1fr;\s*\}\s*\}/s,
  );
});
