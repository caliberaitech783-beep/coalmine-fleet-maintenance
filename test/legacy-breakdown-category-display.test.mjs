import test from 'node:test';
import assert from 'node:assert/strict';
import {requestCategoryLabel,REPAIR_CLASSIFICATION_START} from '../repair-classification.mjs';
const display=request=>requestCategoryLabel(request,{preserveLegacy:true});

test('edited version-1 component categories override stale classification snapshots without modifying saved history',()=>{
 const request={ref:'REQ-1795409435535',createdAt:'2026-11-23 10:21:06',category:'SUPER STRUCTURE',classification:{version:1,repairType:'Breakdown',breakdownCategory:'OTHER',breakdownSubCategory:'custom'}};
 const before=JSON.stringify(request);
 assert.equal(display(request),'SUPER STRUCTURE');
 assert.equal(requestCategoryLabel(request),'SUPER STRUCTURE');
 assert.equal(JSON.stringify(request),before);
 for(const category of ['Breakdown','Preventive','Accidental','Scheduled','Maintenance request','Vehicle','Equipment']){
  assert.equal(display({...request,category,classification:{...request.classification,breakdownCategory:'ENGINE'}}),'ENGINE');
 }
});
test('older requests keep the exact saved original category instead of Unclassified',()=>{
 for(const category of ['Aggregate Repair','WGM','TYRE SYSTEM','Preventive','AC System']){
  const request={createdAt:'2026-10-28T16:59:59+05:30',start:'2026-10-30T10:00:00+05:30',category};
  assert.equal(display(request),category);
  assert.equal(requestCategoryLabel(request),'Unclassified','new-category chart logic is unchanged');
 }
 assert.equal(requestCategoryLabel({}, {preserveLegacy:true,legacyCategory:'Aggregate Repair'}),'Aggregate Repair');
});
test('only post-rollout requests show the new category; new missing classifications stay explicit',()=>{
 assert.equal(display({createdAt:REPAIR_CLASSIFICATION_START,category:'Breakdown',classification:{version:1,breakdownCategory:'ENGINE'}}),'ENGINE');
 assert.equal(display({createdAt:'2026-10-29T12:00:00+05:30',start:'2026-10-04T10:00:00+05:30',category:'Breakdown',classification:{version:1,breakdownCategory:'ENGINE'}}),'ENGINE','a backdated new case still uses the new category');
 assert.equal(display({createdAt:REPAIR_CLASSIFICATION_START,category:'Breakdown'}),'Unclassified');
 assert.equal(display({createdAt:'2026-10-28T16:59:59+05:30',category:'Old category',classification:{version:1,breakdownCategory:'ENGINE'}}),'Old category');
});
test('missing creation metadata uses explicit new classification or the saved legacy value, never guessed text',()=>{
 const request={category:'Aggregate Repair',complaint:'Engine Blow-By'};
 const before=JSON.stringify(request);assert.equal(display(request),'Aggregate Repair');assert.equal(JSON.stringify(request),before);
 assert.equal(display({category:'Breakdown',classification:{version:1,breakdownCategory:'ENGINE'}}),'ENGINE');
 assert.equal(display({breakdownCategory:'HYDRAULIC SYSTEM'}),'HYDRAULIC SYSTEM');
 assert.equal(display({complaint:'Engine Blow-By'}),'Unclassified');
});
