import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('fleet header and card blank space have no drilldown action while count buttons stay explicit',()=>{
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const card=source.slice(source.indexOf('<article className={`mine-panel mine-fleet-region-chart'));
 assert.ok(card.length, 'fleet chart card exists without a delegated click action');
 const opening=card.slice(0,card.indexOf('<header>'));
 assert.doesNotMatch(opening,/onClick|dashboardListTrigger|cardAction/);
 const header=card.slice(card.indexOf('<header>'),card.indexOf('</header>'));
 assert.ok(header.startsWith('<header>'));
 assert.ok(header.includes('setFleetChartMode(mode)'));
 assert.ok(header.includes('className="mine-fleet-toggle-count"'));
 assert.ok(header.includes('else openBreakdownList()'));
 assert.ok(header.includes('openAssetDrilldown("all")'));
 assert.doesNotMatch(header,/<h2[^>]*onClick/);
});
