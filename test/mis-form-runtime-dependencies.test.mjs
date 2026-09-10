import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {fileURLToPath} from "node:url";
import {build} from "vite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("workflow time fields import the shared browser validation pattern", () => {
  assert.equal(
    /import\s*\{\s*TIME_24H_PATTERN\s*\}\s*from\s*["']\.\.\/request-time\.mjs["'];/.test(source),
    true,
    "first-trip, maintenance, and scheduling forms must not depend on an undefined browser global",
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
