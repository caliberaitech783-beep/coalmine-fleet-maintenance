import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

test("fleet panel fills its lifecycle row without an empty space below", () => {
  const css = readFileSync(new URL("../src/dashboard-concept-a.css", import.meta.url), "utf8");
  assert.match(css, /\.mine-dashboard-core > \.mine-fleet-command \{[^}]*align-self: stretch;[^}]*display: flex;[^}]*flex-direction: column;/);
  assert.match(css, /\.mine-dashboard-core > \.mine-fleet-command > \.mine-fleet-command-body \{ flex: 1; \}/);
});
