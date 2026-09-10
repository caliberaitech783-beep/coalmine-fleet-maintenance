import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const fast = readFileSync(new URL("../.github/workflows/fast-ui-deploy.yml", import.meta.url), "utf8");
const full = readFileSync(new URL("../.github/workflows/azure-hosting_coalmine-fleet-azure-783.yml", import.meta.url), "utf8");

test("UI-only commits use the fast lane while protected changes retain staging", () => {
  assert.match(full, /paths-ignore:[\s\S]*"src\/\*\*"[\s\S]*"public\/\*\*"[\s\S]*"index\.html"[\s\S]*"test\/\*\*"/);
  assert.match(fast, /Enforce the fast-lane file boundary/);
  assert.match(fast, /src\/\*\|public\/\*\|index\.html/);
  assert.match(fast, /\*\) eligible=false/);
  assert.match(fast, /if: needs\.classify\.outputs\.eligible == 'true'/);
  assert.doesNotMatch(fast, /^concurrency:/m);
  assert.match(fast, /  deploy:[\s\S]*    concurrency:[\s\S]*group: coalmine-fleet-production/);
  assert.match(full, /group: coalmine-fleet-production/);
});

test("fast lane builds complete current and rollback packages", () => {
  assert.match(fast, /npm run build/);
  assert.match(fast, /current-package\.zip/);
  assert.match(fast, /rollback-package\.zip/);
  assert.match(fast, /git archive "\$PREVIOUS_SHA"/);
  assert.match(fast, /retention-days: 14/);
});

test("fast lane verifies production and restores the previous package on failure", () => {
  assert.match(fast, /az webapp deploy/);
  assert.match(fast, /\/api\/health\?fast-ui=/);
  assert.match(fast, /grep -oE 'src="\/assets\//);
  assert.match(fast, /"\$\{LIVE_URL\}\$\{asset\}"/);
  assert.match(fast, /h\.commit!==process\.env\.EXPECTED_COMMIT/);
  assert.match(fast, /Restore previous complete package on failure/);
  assert.match(fast, /\/api\/health\?fast-ui-rollback=/);
  assert.match(fast, /scheduledJobsEnabled!==true/);
});
