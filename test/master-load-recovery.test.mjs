import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("master API failures show an explicit retry state instead of authoritative empty data", () => {
  const hook = source.slice(source.indexOf("function useMasterRecords"), source.indexOf("function MetaWhatsAppSetup"));
  assert.match(hook, /\[loadError, setLoadError\] = useState\(""\)/);
  assert.match(hook, /const controller = new AbortController\(\)/);
  assert.match(hook, /if \(!response\.ok\) throw new Error/);
  assert.match(hook, /setLoaded\(true\)/);
  assert.match(hook, /setLoadError\(error\.message/);
  assert.match(hook, /\.catch\(\(error\) => \{[\s\S]*setLoadError/);
  assert.match(hook, /setLoadAttempt\(\(attempt\) => attempt \+ 1\)/);
});

test("desktop master pages render the shared load error with Retry", () => {
  assert.match(source, /function MasterLoadError\(\{ name, error, retry \}\)/);
  assert.match(source, /Unable to show reliable data/);
  assert.match(source, /onClick=\{retry\}/);
  assert.ok((source.match(/return <MasterLoadError/g) || []).length >= 5);
});
