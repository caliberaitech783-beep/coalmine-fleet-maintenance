import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fleetMovementLedger} from '../src/fleet-movement-ledger.mjs';
import {indiaDateTimeEpoch} from '../report-date-range.mjs';
import {recordBelongsToSite} from '../site-location.mjs';
import {dashboardFleetSnapshot} from '../dashboard-fleet-snapshot.mjs';
import {availabilityRequestsForDate} from '../src/dashboard-availability.mjs';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const readerSource=source.slice(source.indexOf('  const fleetMovementForRange ='),source.indexOf('  const breakdownSiteSummary ='));
function reader(assets,requests,initial=Date.parse('2026-10-29T10:00:00+05:30')){
 let now=initial,calls=0;
 const bindings={useMemo:fn=>fn(),throughputRequests:requests,throughputEquipment:assets,todayKey:'2026-10-29',Date:{now:()=>now},recordBelongsToSite,indiaDateTimeEpoch,dashboardFleetSnapshot,availabilityRequestsForDate,fleetMovementLedger:(...args)=>{calls++;return fleetMovementLedger(...args);}};
 const read=new Function(...Object.keys(bindings),readerSource+'return fleetMovementForRange;')(...Object.values(bindings));
 return {read,calls:()=>calls,at:time=>{now=time;}};
}
test('unchanged dashboard interactions do not rebuild fleet movement or change results',()=>{
 const assets=Array.from({length:1600},(_,i)=>({door:`D${i}`,currentLocation:`Mine ${i%8}`}));
 const requests=Array.from({length:24000},(_,i)=>({door:`D${i%1600}`,site:`Mine ${i%8}`,start:'2026-10-01T08:00:00+05:30',status:i<23800?'Closed':'Open',closedAt:i<23800?'2026-10-02T09:00:00+05:30':''}));
 const cached=reader(assets,requests),expected=[];
 for(let i=0;i<8;i++)expected.push(cached.read(`Mine ${i}`,'2026-10-29','2026-10-29'));
 assert.equal(cached.calls(),8);
 for(let interaction=0;interaction<30;interaction++)for(let i=0;i<8;i++)assert.equal(cached.read(`Mine ${i}`,'2026-10-29','2026-10-29'),expected[i]);
 assert.equal(cached.calls(),8,'240 repeated menu/filter renders do no ledger work');
 const fresh=reader(assets,requests.map(row=>({...row,status:'Closed',closedAt:'2026-10-29T09:00:00+05:30'})));
 assert.equal(fresh.read('Mine 0','2026-10-29','2026-10-29').balance,0,'updated inputs never inherit the old cache');
});
test('date/scope changes and future timestamp boundaries invalidate exactly when needed',()=>{
 const assets=[{door:'D1',currentLocation:'Sasti OC'}];
 const cached=reader(assets,[{door:'D1',site:'Sasti OC',start:'2026-10-29T11:00:00+05:30',status:'Open'}]);
 const before=cached.read('Sasti OC','2026-10-29','2026-10-29');
 assert.equal(before.incoming,0);
 cached.at(Date.parse('2026-10-29T11:00:00+05:30'));
 const after=cached.read('Sasti OC','2026-10-29','2026-10-29');
 assert.equal(after.incoming,1);assert.notEqual(after,before);
 const historical=cached.read('Sasti OC','2026-10-28','2026-10-28');
 cached.at(Date.parse('2026-10-29T12:00:00+05:30'));
 assert.equal(cached.read('Sasti OC','2026-10-28','2026-10-28'),historical);
 assert.equal(cached.read('Other site','2026-10-29','2026-10-29').total,0);
});
test('movement caches are bounded, scope inputs stay stable and unopened daily details do no work',()=>{
 assert.match(readerSource,/results.size>=32/);
 assert.match(readerSource,/\[throughputRequests,throughputEquipment,todayKey\]/);
 for(const name of ['throughputRequests','throughputEquipment','availabilityEquipment','availabilityKpis'])assert.match(source,new RegExp(`const ${name} = useMemo`));
 const daily=source.slice(source.indexOf('  const breakdownDetailRows ='),source.indexOf('  const breakdownDetailTotals ='));
 assert.match(daily,/useMemo/);assert.match(daily,/if\(!breakdownDetailSite/);
 assert.doesNotMatch(daily,/dailyBreakdownMovementForShift/,'date labels must not first scan every request for every day');
});
