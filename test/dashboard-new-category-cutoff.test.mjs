import test from 'node:test';
import assert from 'node:assert/strict';
import {newCategoryMixRequests,newBreakdownCategoryShare,breakdownMovementForRange} from '../dashboard-breakdown-movement.mjs';
import {throughputSectionExport} from '../src/dashboard-section-export.mjs';
const row=(id,createdAt,category='ENGINE')=>Object.freeze({id,createdAt,start:'2026-10-29 09:00',status:'Open',classification:Object.freeze({breakdownCategory:category})});
test('new mix uses immutable creation time with inclusive 2 PM IST boundary',()=>{
 const rows=[row(1,'2026-10-29T08:29:59.999Z'),row(2,'2026-10-29T08:30:00Z'),row(3,'2026-10-29 14:00:00'),row(4,'2026-10-29T14:00:01+05:30'),row(5,undefined),row(6,'invalid')];
 assert.deepEqual(newCategoryMixRequests(rows).map(r=>r.id),[2,3,4]);
 assert.deepEqual(newCategoryMixRequests([{...row(7,'2026-10-28T08:30:00Z'),start:'2026-10-30 15:00'}]),[]);
 assert.equal(newCategoryMixRequests([{...row(8,'2026-10-29T09:00:00Z'),start:'2020-01-01 09:00'}]).length,1);
});
test('old category is never read and stored objects are not changed',()=>{
 const old={createdAt:'2026-10-29T08:29:59Z',get classification(){throw Error('historical category accessed');}};
 const current=row(2,'2026-10-29T08:30:00Z');
 const before=JSON.stringify(current);
 assert.deepEqual(newCategoryMixRequests([old,current]),[current]);
 assert.equal(JSON.stringify(current),before);
});
test('pending classification is separate from percentages and overall BD totals stay identical',()=>{
 const rows=[row(1,'2026-10-28T09:00:00Z',''),row(2,'2026-10-29T09:00:00Z'),row(3,'2026-10-29T09:00:00Z','WGM'),row(4,'2026-10-29T09:00:00Z','')];
 const before=breakdownMovementForRange(rows,'2026-10-29','2026-10-29');
 const mix=newBreakdownCategoryShare(rows,'','',['ENGINE','WGM','UNCLASSIFIED']);
 assert.deepEqual(mix,[{label:'ENGINE',count:1,percentage:50},{label:'WGM',count:1,percentage:50}]);
 assert.deepEqual(newCategoryMixRequests(rows,'pending').map(r=>r.id),[4]);
 assert.equal(newCategoryMixRequests(rows,'all').length,3);
 assert.deepEqual(breakdownMovementForRange(rows,'2026-10-29','2026-10-29'),before);
 const result=throughputSectionExport({openBalance:4,categoryMixScope:'Created from 29 Oct 2026, 2:00 PM IST',categoryMixPending:1,typeMix:mix});
 assert.equal(result.rows.find(r=>r.name==='Summary · BD Balance (open, excluding idle)').balance,4);
 assert.equal(result.rows.find(r=>r.name.startsWith('Classification pending')).balance,1);
 assert.match(result.rows.find(r=>r.share===50).name,/Created from 29 Oct 2026/);
});
