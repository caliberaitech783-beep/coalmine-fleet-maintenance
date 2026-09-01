import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("overdue maintenance requests support daily remarks and twice-daily reminders", () => {
  const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const source = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.match(server, /CREATE TABLE IF NOT EXISTS maintenance_daily_remarks/);
  assert.match(server, /app\.post\('\/api\/requests\/:reference\/daily-remarks'/);
  assert.match(server, /created_at AT TIME ZONE 'Asia\/Kolkata'[\s\S]*NOW\(\) AT TIME ZONE 'Asia\/Kolkata'/);
  assert.match(server, /UPDATE maintenance_daily_remarks SET remark=\$1,delay_reason=\$2/);
  assert.match(server, /res\.status\(updatedToday\?200:201\)/);
  assert.match(server, /hour>=18\?'18':hour>=9\?'09'/);
  assert.match(server, /Maintenance Manager','Production Manager/);
  assert.match(source, /function DailyRemarkForm/);
  assert.match(source, /Reason for delay/);
  assert.match(source, /Previous daily updates/);
  assert.match(source, /Read only/);
  assert.match(source, /New daily record/);
  assert.match(source, /Update today’s record/);
  assert.match(source, /Today’s update can be edited/);
  assert.match(source, /defaultValue=\{todayRemark\?\.remark\|\|""\}/);
  assert.match(source, /onRemark && String\(row\.status\)/);
  assert.match(source, /reminder: add today’s maintenance update/);
  assert.match(source, /<MaintenanceRemarks remarks=\{r\.dailyRemarks\}/);
});
