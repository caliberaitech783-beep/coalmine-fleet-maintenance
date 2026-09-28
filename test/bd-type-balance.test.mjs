import test from "node:test";
import assert from "node:assert/strict";
import { breakdownTypeShare, normalizedBreakdownType } from "../dashboard-breakdown-movement.mjs";
import { movementRequestRows } from "../src/dashboard-card-actions.mjs";

test("BD type mix uses open balance, including carryover and excluding closed and idle", () => {
  const counts = { Breakdown: 52, Accidental: 4, Preventive: 10, "Aggregate Repair": 1, "Super Structure": 1, WGM: 5 };
  const rows = Object.entries(counts).flatMap(([category, count]) => Array.from({ length: count }, (_, index) => ({
    ref: `${category}-${index}`, category, status: "Open", start: "2026-09-01",
  })));
  rows.push({ category: "Breakdown", status: "Closed", start: "2026-09-16", closedAt: "2026-09-16" });
  rows.push({ category: "Breakdown", status: "Idle", start: "2026-09-01" });
  rows.push({ category: "WGM", status: "Ideal", start: "2026-09-16" });
  const balance = movementRequestRows(rows, "2026-09-16", "2026-09-16", "active-balance");
  assert.equal(balance.length, 73);
  const mix = breakdownTypeShare(balance);
  for (const item of mix) {
    assert.equal(item.count, counts[item.label]);
    assert.equal(item.percentage, Math.round(counts[item.label] / 73 * 100));
  }
  assert.ok(breakdownTypeShare([]).every(item => item.count === 0 && item.percentage === 0));
});

test("BD type mix includes every master category and preserves legacy categories and exact drilldown counts", () => {
  const categories = ['PREVENTIVE','WGM','SUPER STRUCTURE','ACCIDENTAL','AGGREGATE REPAIR','TYRE SYSTEM','AC SYSTEM','DRIVE LINE','OTHERS','GROUND ENGAGING TOOLS (GET)','SCHEDULED SERVICE','SUSPENSION','ELECTRICAL','HYDRAULIC SYSTEM','UNDER CARRIAGE/TRACK'];
  const masters = [...categories.map(repairType => ({repairType})), {repairType:'ac system'}, {repairType:'Future type'}];
  const rows = [...categories, 'Breakdown', 'Legacy type'].map(category => ({category,status:'Open',start:'2026-09-01'}));
  const mix = breakdownTypeShare(rows, '', '', masters);
  for (const category of categories) assert.ok(mix.some(item => item.label === normalizedBreakdownType(category)));
  assert.equal(new Set(mix.map(item => item.label)).size, mix.length);
  assert.equal(mix.reduce((sum,item) => sum+item.count,0), rows.length);
  assert.equal(mix.find(item => item.label==='Future Type').count,0);
  for (const item of mix) {
    assert.equal(item.count, rows.filter(row => normalizedBreakdownType(row.category)===item.label).length);
    assert.equal(item.percentage,Math.round(item.count/rows.length*100));
  }
  assert.ok(breakdownTypeShare([], '', '', masters).some(item => item.label==='Tyre System' && item.count===0));
  assert.equal(normalizedBreakdownType('Other'),normalizedBreakdownType('OTHERS'));
});

test("Others stays last without changing other category order or values", () => {
  const rows = ['Other', 'OTHERS', 'Electrical'].map(category => ({category}));
  const mix = breakdownTypeShare(rows, '', '', ['Others', 'Tyre System', 'Electrical']);
  assert.deepEqual(mix.map(item => item.label), ['Breakdown', 'Accidental', 'Preventive', 'Aggregate Repair', 'Super Structure', 'WGM', 'Tyre System', 'Electrical', 'Others']);
  assert.deepEqual(mix.at(-1), {label:'Others', count:2, percentage:67});
  assert.equal(mix.find(item => item.label==='Electrical').percentage,33);
  assert.equal(breakdownTypeShare([], '', '', ['Others','Electrical']).at(-1).label,'Others');
  assert.ok(!breakdownTypeShare([]).some(item => item.label==='Others'));
});
