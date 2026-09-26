import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {build} from "vite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("workflow time fields import the shared 12-hour controls", () => {
  assert.equal(
    /import\s*\{\s*TwelveHourDateTimeInput\s*,\s*TwelveHourTimeInput\s*\}\s*from\s*["']\.\/twelve-hour-input\.jsx["'];/.test(source),
    true,
    "first-trip and scheduling forms must use the shared AM/PM controls",
  );
});

test("production bundle contains no unresolved time-pattern global", async () => {
  const result = await build({
    root: projectRoot,
    logLevel: "silent",
    build: {write: false},
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output || []);
  const javascript = outputs.filter((entry) => entry.type === "chunk").map((entry) => entry.code).join("\n");
  assert.ok(javascript, "Vite should produce at least one JavaScript chunk");
  assert.doesNotMatch(javascript, /\bTIME_24H_PATTERN\b/);
});
