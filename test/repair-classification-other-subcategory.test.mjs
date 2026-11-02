import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {classificationError,normalizeClassification,validateClassification} from '../repair-classification.mjs';

const categories=[{breakdownCategory:'ENGINE'},{breakdownCategory:'WGM'},{breakdownCategory:'SCHEDULED SERVICE'}];
const mappings=[{breakdownCategory:'ENGINE',subCategory:'FUEL PUMP'},{breakdownCategory:'WGM',subCategory:'WGM'},{breakdownCategory:'SCHEDULED SERVICE',subCategory:'HOUR SERVICE 250'}];

test('Preventive, Breakdown and Accidental accept the Other sub-category',()=>{
  for(const repairType of ['Preventive','Breakdown','Accidental']){
    const input={repairType,breakdownCategory:'ENGINE',breakdownSubCategory:'Other'};
    assert.equal(classificationError(input,true,{categories,mappings}),'');
    assert.deepEqual(validateClassification(repairType,'ENGINE','Other',categories,mappings),{breakdownCategory:'ENGINE',subCategory:'Other'});
    assert.deepEqual(normalizeClassification(input),input);
  }
});

test('custom sub-categories stay blocked for WGM and Scheduled',()=>{
  for(const [repairType,category] of [['WGM','WGM'],['Scheduled','SCHEDULED SERVICE']]){
    assert.match(classificationError({repairType,breakdownCategory:category,breakdownSubCategory:'Custom',customSubCategory:true},true,{categories,mappings}),/allowed only/);
  }
});

test('Create Request shows Other without adding another reason field',()=>{
  const source=readFileSync(new URL('../src/repair-classification-fields.jsx',import.meta.url),'utf8');
  assert.match(source,/\['preventive','breakdown','accidental'\]\.includes\(repairTypeKey\(repairType\)\)/);
  assert.match(source,/customAllowed&&selectedCategory\?\[\.\.\.mappedOptions,'Other'\]/);
  assert.doesNotMatch(source,/Other Breakdown Sub-category/);
  assert.doesNotMatch(source,/placeholder="Enter breakdown sub-category"/);
  assert.match(source,/<select name="breakdownSubCategory"/);
});
