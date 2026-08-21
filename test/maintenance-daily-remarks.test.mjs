import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("overdue maintenance requests support daily remarks and twice-daily reminders", () => {
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(server, /CREATE TABLE IF NOT EXISTS maintenance_daily_remarks/);
  assert.match(server, /app\.post\('\/api\/requests\/:reference\/daily-remarks'/);
  assert.match(server, /started_at<=NOW\(\)-INTERVAL '1 day'/);
  assert.match(server, /hour>=18\?'18':hour>=9\?'09'/);
  assert.match(server, /Maintenance Manager','Production Manager/);
  assert.match(source, /function DailyRemarkForm/);
  assert.match(source, /Reason for delay/);
  assert.match(source, /onRemark && days >= 1/);
  assert.match(source, /reminder: add today’s maintenance update/);
  assert.match(source, /<MaintenanceRemarks remarks=\{r\.dailyRemarks\}/);
});
