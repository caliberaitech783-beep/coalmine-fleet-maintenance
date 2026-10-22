import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lifecycleTimeMatches} from '../src/dashboard-lifecycle-time.mjs';
import {requestEventDate} from '../src/dashboard-request-data.mjs';

test('lifecycle timing uses the appropriate event timestamp in IST and inclusive minute limits',()=>{
 const record={start:'2026-10-22T03:30:00Z',closedAt:'2026-10-22 11:30:59',verifiedAt:'2026-10-22 · 15:00:00',idealRequestedAt:'2026-10-22T23:30:00+05:30'};
 assert.equal(lifecycleTimeMatches(record,'opened','09:00','09:00'),true);
 assert.equal(lifecycleTimeMatches(record,'closed','09:00','11:30'),true);
 assert.equal(lifecycleTimeMatches(record,'verified','09:00','11:30'),false);
 assert.equal(lifecycleTimeMatches(record,'idle','22:00','06:00'),true);
 assert.equal(lifecycleTimeMatches(record,'closed','22:00','06:00'),false);
 assert.equal(lifecycleTimeMatches({start:'2026-10-23T00:30:00+05:30'},'opened','22:00','06:00'),true);
});
test('blank, one-sided, missing, fallback and invalid times are handled explicitly',()=>{
 assert.equal(lifecycleTimeMatches({},'closed'),true);
 assert.equal(lifecycleTimeMatches({},'closed','10:00'),false);
 assert.equal(lifecycleTimeMatches({start:'2026-10-22'},'opened','00:00','23:59'),false);
 assert.equal(lifecycleTimeMatches({createdAt:'2026-10-22 13:00:00'},'opened','12:00'),true);
 assert.equal(lifecycleTimeMatches({idleRequestedAt:'2026-10-22 13:00:00'},'idle','','12:00'),false);
 assert.equal(lifecycleTimeMatches({start:'2026-10-22 13:00:00'},'opened','25:00'),false);
});
test('lifecycle cards, MIS queue, charts and exports share the selected times without altering other dashboard filters',()=>{
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.match(source,/requestMatchesLifecycleTime\(record,event\)/);
 assert.match(source,/requestMatchesLifecycleTime\(record,requestEventDate\(record,"closed"\)\?"closed":"opened"\)/);
 assert.match(source,/rangeLabel: requestLifecycleRangeLabel/);
 assert.match(source,/IST daily/);
 const controls=source.slice(source.indexOf('<div className="mine-lifecycle-region-time">'),source.indexOf('</header>',source.indexOf('<div className="mine-lifecycle-region-time">')));
 for(const label of ['LifecycleTimeControls','onApply=','lifecycleSectionTable()'])assert.ok(controls.includes(label));
 const regionRow=controls.slice(0,controls.indexOf('<div className="mine-lifecycle-time-export">'));
 assert.ok(regionRow.includes('Request lifecycle region'));
 assert.ok(regionRow.includes('LifecycleTimeControls'));
 const layout=readFileSync(new URL('../src/lifecycle-controls-layout.css',import.meta.url),'utf8');
 assert.ok(layout.includes('minmax(130px, 1fr) minmax(0, 280px)'));
 assert.ok(layout.includes('font-size: 12px !important'));
 assert.ok(source.includes('import "./lifecycle-controls-layout.css"'));
});

test('real lifecycle aggregation counts and drilldown rows use each event time rather than the opening time',()=>{
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 const calculation=source.slice(source.indexOf('  const requestLifecycleRows ='),source.indexOf('  // Pending MIS work'));
 const calculate=new Function('locationBreakdowns','requestEventDate','requestMatchesLifecycleTime',`const safeTrendStartKey='2026-10-22',requestTrendEndKey='2026-10-22',requestLifecycleRegion=null,requestLifecycleSite=null,isIdleVehicleRequest=record=>record.status==='Idle'; ${calculation}; return requestLifecycleRows;`);
 const rows=[
  {ref:'a',requesterRole:'Production User',status:'Closed',start:'2026-10-22 08:00:00',closedAt:'2026-10-22 10:30:00'},
  {ref:'b',requesterRole:'Maintenance User',status:'Closed',start:'2026-10-22 10:00:00',closedAt:'2026-10-22 14:00:00',verifiedAt:'2026-10-22 10:45:00'},
 ];
 const result=calculate(rows,requestEventDate,(record,event)=>lifecycleTimeMatches(record,event,'10:00','11:00'));
 assert.deepEqual(result.production.map(row=>row.ref),['b']);
 assert.deepEqual(result.closed.map(row=>row.ref),['a']);
 assert.deepEqual(result.verified.map(row=>row.ref),['b']);
 assert.equal(result.dateCounts.closed.get('2026-10-22'),1);
 assert.equal(calculate(rows,requestEventDate,(record,event)=>lifecycleTimeMatches(record,event)).closed.length,2);
});
