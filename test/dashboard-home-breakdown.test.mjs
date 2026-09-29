import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
test('Breakdown keeps its full count and list independently of OEM mode', () => {
  assert.ok(!source.includes('(showOemBreakdowns ? oemChart.rows.length : accountBreakdownCount)'));
  assert.ok(!source.includes('else if (showOemBreakdowns) openOemDrilldown();'));
  assert.ok(source.includes('else openBreakdownList();'));
});
test('Dashboard navigation resets the mode and both drilldowns before same-page return', () => {
  assert.match(source, /const showBreakdownDashboard = \(\) => \{\s*setFleetChartMode\("breakdown"\);\s*setAssetDrilldown\(""\);\s*setOemDrilldownKind\(null\);/);
  assert.match(source, /if \(name === "Dashboard"\) window.dispatchEvent\(new CustomEvent\("nerve-center:dashboard-home"\)\);\s*if \(name === active\) return;/);
});
