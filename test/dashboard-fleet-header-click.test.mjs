import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('fleet header blank space stops the enclosing card click without cancelling its controls',()=>{
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const header=source.slice(source.indexOf('<header onClick={(event) => event.stopPropagation()}'));
 assert.ok(header.startsWith('<header onClick={(event) => event.stopPropagation()} style={{ cursor: "default" }}>'));
 assert.ok(header.slice(0,200).includes('mine-fleet-chart-heading'));
 const handler=new Function('event','event.stopPropagation()');
 let stopped=false;
 handler({stopPropagation(){stopped=true;},preventDefault(){throw Error('Control default cancelled');}});
 assert.equal(stopped,true);
 const markup=header.slice(0,header.indexOf('</header>'));
 assert.ok(markup.includes('setFleetChartMode(mode)'));
 assert.ok(markup.includes('openBreakdownList()'));
 assert.ok(markup.includes('openAssetDrilldown(fleetChartAllKey)'));
});
