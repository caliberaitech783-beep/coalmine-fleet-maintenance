import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('OEM BD retains its chart and adds a site-wise detail report view',()=>{
  assert.match(source,/\[oemView, setOemView\] = useState\("chart"\)/);
  assert.match(source,/\["details", "Site-wise detailing"\]/);
  assert.match(source,/aria-pressed=\{oemView === view\}/);
  assert.match(source,/oemView === "details" \? <section/);
  assert.match(source,/selection=\{oemSiteDetailSelection\}/);
  assert.match(source,/<OemBreakdownChart chart=\{oemChart\} toolbarTarget=\{oemViewToolbarTarget\}/);
  assert.match(source,/className="mine-oem-view-toolbar" ref=\{setOemViewToolbarTarget\}/);
});
test('site detail selection shares filtered chart data without a stale chart-bar category',()=>{
  const selection=source.slice(source.indexOf('const oemSiteDetailSelection ='),source.indexOf('const oemDrilldown ='));
  assert.match(selection,/createOemBreakdownSelection\(oemChart\)/);
  assert.doesNotMatch(selection,/oemDrilldownCategory/);
  assert.match(selection,/oemLive \? "Current breakdowns" : filteredDateLabel/);
});
