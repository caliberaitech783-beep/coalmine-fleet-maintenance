import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("global request exclusion feeds request APIs, Info Pulse, and director reports", () => {
  assert.match(server, /import \{requestsVisibleGlobally,requestsVisibleToSession\} from '\.\/mis-request-visibility\.mjs'/);
  assert.match(server, /const visibleRows=requestsVisibleToSession\(siteVisibleRows,req\.session\)/);
  assert.match(server, /requestsVisibleToSession\(scopeInfoPulseRequests\(rows,scope\),authorization\.session\)/);
  assert.match(server, /requests:await attachDailyRemarks\(requestsVisibleGlobally\(requestRows\)\)/);
});
