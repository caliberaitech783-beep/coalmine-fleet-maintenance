import test from 'node:test';
import assert from 'node:assert/strict';
import {fleetMovementLedger} from '../src/fleet-movement-ledger.mjs';
import {dashboardFleetSnapshot} from '../dashboard-fleet-snapshot.mjs';
import {availabilityRequestsForDate} from '../src/dashboard-availability.mjs';
const assets=['S1','S2','S3','S4','S5'].map(door=>({door,currentLocation:'Sasti OC'}));
const req=(door,start,end='',extra={})=>({door,site:'Sasti OC',start,status:end?'Closed':'Open',closedAt:end,...extra});
const now=Date.parse('2026-10-29T17:00:00+05:30');
function ledger(requests,from='2026-10-29',to='2026-10-29'){
 const endingEquipment=dashboardFleetSnapshot(assets,availabilityRequestsForDate(requests,to));
 return fleetMovementLedger(assets,requests,from,to,{now,endingEquipment});
}
test('Opening + In - Out equals availability: duplicate requests, same-day repairs, carryover idle and running BD',()=>{
 const requests=[
  req('S1','2026-10-28T09:00'),req('S1','2026-10-29T09:00'),
  req('S2','2026-10-28T09:00','2026-10-29T10:00',{vehicleIdle:true,idealRequestedAt:'2026-10-29T10:00'}),
  req('S3','2026-10-29T09:00','2026-10-29T10:00'),req('S3','2026-10-29T11:00'),
  req('S4','2026-10-28T09:00','',{status:'Running BD',runningBdAt:'2026-10-29T10:00'}),
  req('S5','2026-10-29T12:00','2026-10-29T13:00'),
 ];
 const before=JSON.stringify(requests),result=ledger(requests);
 assert.equal(result.verified,true,JSON.stringify(result.issues));
 assert.deepEqual([result.open,result.incoming,result.outgoing,result.balance,result.idle],[3,3,4,2,1]);
 assert.equal(result.open+result.incoming-result.outgoing,result.balance);
 for(const key of ['open','incoming','outgoing','balance','idle'])assert.equal(result.rows[key].length,result[key]);
 assert.equal(JSON.stringify(requests),before);
});
test('overlapping repairs do not release a vehicle until the final overlapping repair ends',()=>{
 const result=ledger([req('S1','2026-10-28T09:00','2026-10-29T10:00'),req('S1','2026-10-29T09:00','2026-10-29T11:00')]);
 assert.equal(result.verified,true);
 assert.deepEqual([result.open,result.incoming,result.outgoing,result.balance],[1,0,1,0]);
});
test('IST midnight edges, multi-day and empty ranges reconcile without a synthetic balancing event',()=>{
 const requests=[req('S1','2026-10-28T09:00','2026-10-29T00:00'),req('S2','2026-10-29T00:00')];
 for(const [from,to] of [['2026-10-28','2026-10-28'],['2026-10-29','2026-10-29'],['2026-10-28','2026-10-29'],['','']]){
  const result=ledger(requests,from,to);assert.equal(result.verified,true,JSON.stringify(result.issues));
  assert.equal(result.open+result.incoming-result.outgoing,result.balance);
 }
});
test('unknown identity, missing dates, invalid ordering and mismatched live snapshot are flagged, never balanced by subtraction',()=>{
 for(const requests of [[req('MISSING','2026-10-28T09:00')],[req('S1','')],[req('S1','2026-10-29T10:00','2026-10-29T09:00')],[req('S1','2026-10-28T09:00','',{status:'Closed'})]])assert.equal(ledger(requests).verified,false);
 const result=fleetMovementLedger(assets,[req('S1','2026-10-28T09:00')],'2026-10-29','2026-10-29',{now,endingEquipment:assets.map(row=>({...row,dashboardRoadStatus:'onroad'}))});
 assert.equal(result.verified,false);assert.equal(result.open,1);assert.equal(result.incoming,0);assert.equal(result.outgoing,0);assert.equal(result.balance,0);
});
test('all verified intervals reconcile under many overlapping/repeated repair combinations',()=>{
 let seed=29;const next=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 for(let run=0;run<60;run++){
  const requests=Array.from({length:20},()=>{
   const door=`S${next()%5+1}`,hour=next()%14+1,length=next()%3+1;
   return req(door,`2026-10-29T${String(hour).padStart(2,'0')}:00`,next()%4===0?'':`2026-10-29T${String(hour+length).padStart(2,'0')}:00`);
  });
  const result=ledger(requests);
  assert.equal(result.verified,true,JSON.stringify(result.issues));
  assert.equal(result.open+result.incoming-result.outgoing,result.balance);
 }
});
