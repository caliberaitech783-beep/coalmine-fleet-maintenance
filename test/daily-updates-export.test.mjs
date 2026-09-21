import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { dailyUpdatesExportText } from "../src/daily-updates-order.mjs";
import { tableModel } from "../src/table-actions-model.mjs";

test("daily updates export includes every saved update and all of its details", () => {
  const text = dailyUpdatesExportText([
    { createdAt: "2026-09-21 10:48:00", authorName: "Maintenance B", remark: "Parts fitted", delayReason: "Testing pending" },
    { createdAt: "2026-09-20 19:43:00", authorName: "Maintenance A", remark: "Compressor removed", delayedReason: "Clutch kit unavailable" },
  ], { category: "Preventive" });

  const lines = text.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^#1 \| 7:43:00 PM 20-09-2026/);
  assert.match(lines[0], /By: Maintenance A/);
  assert.match(lines[0], /Update: Compressor removed/);
  assert.match(lines[0], /Type: Preventive/);
  assert.match(lines[0], /Delayed reason: Clutch kit unavailable/);
  assert.match(lines[1], /^#2 \| 10:48:00 AM 21-09-2026/);
  assert.match(lines[1], /Update: Parts fitted/);
  assert.match(lines[1], /Delayed reason: Testing pending/);
  assert.equal(dailyUpdatesExportText([]), "—");
});

test("rich table cells use their explicit complete export value", () => {
  const RichCell = () => React.createElement("details", null, "2 updates");
  const children = React.createElement(React.Fragment, null,
    React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Daily updates"))),
    React.createElement("tbody", null, React.createElement("tr", null,
      React.createElement("td", { "data-export-value": "#1 full update\n#2 full update" }, React.createElement(RichCell)),
    )),
  );
  const model = tableModel(children);
  const row = React.Children.toArray(React.Children.toArray(children.props.children)[1].props.children)[0];
  assert.equal(model.columns[0].value(row), "#1 full update\n#2 full update");
});

test("Excel and print output preserve and wrap multiline daily updates", async () => {
  const main = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const pdf = await readFile(new URL("../table-export-pdf.mjs", import.meta.url), "utf8");
  const browser = await readFile(new URL("../src/dashboard-record-browser.jsx", import.meta.url), "utf8");
  const mainRemarks = (main.match(/dailyUpdatesExportText\(row\.dailyRemarks, \{ category: row\.category \}\)/g) || []).length;
  assert.match(main, /xml:space="preserve"/);
  assert.match(main, /<alignment wrapText="1" vertical="top"\/>/);
  assert.match(main, /td\{white-space:pre-wrap\}/);
  assert.match(pdf, /split\(\/\\r\?\\n\/\)/);
  assert.equal((browser.match(/data-export-value=\{dailyUpdatesExportText\(record\.dailyRemarks/g) || []).length, 2);
  assert.ok(mainRemarks >= 2, "workflow report exports format every daily update");
  assert.match(browser, /data-export-value=\{column\.exportValue \? column\.exportValue\(record\) : undefined\}/);
});
