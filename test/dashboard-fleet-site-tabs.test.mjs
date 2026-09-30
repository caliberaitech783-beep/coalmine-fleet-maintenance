import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groupOemRecordsBySite, oemDetailReportRows} from '../src/oem-dashboard-filters.mjs';
const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
test('Dashboard navigation scrolls back to its banner after clearing detail views', () => {
  assert.match(source,/setOemDrilldownKind\(null\);\s*requestAnimationFrame\(\(\) => dashboardBannerRef.current\?\.scrollIntoView\(\{block: "start", behavior: "auto"\}\)\)/);
});
test('fleet header drilldowns use the shared site and equipment grouping without losing records', () => {
  assert.match(source,/\["all", "fleet-breakdown:account", "fleet-breakdown:balance", "fleet-breakdown:all"\].includes\(assetDrilldown\) \|\| assetDrilldown.startsWith\("entered-today:"\)/);
  assert.match(source,/rows=\{fleetSiteTabRows\} groupBySite=\{showFleetSiteTabs\}/);
  const rows=[{id:'a',requestSite:'Sasti OC',make:'Volvo',group:'Tippers'}, {id:'b',requestSite:'Sasti OC',make:'LiuGong',group:'Dozers'}];
  const grouped=oemDetailReportRows(groupOemRecordsBySite(rows,[{code:'WCL',sites:['Sasti OC']}]),true);
  assert.equal(grouped.length,2);
  assert.match(grouped[0].reportSite,/Sasti OC — Volvo Tippers/i);
  assert.match(grouped[1].reportSite,/Sasti OC — LiuGong Dozers/i);
});
