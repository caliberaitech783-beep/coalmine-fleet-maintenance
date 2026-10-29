import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';
import * as helpers from '../repair-classification.mjs';
const source=readFileSync(new URL('../src/repair-classification-fields.jsx',import.meta.url),'utf8');
const {code}=await transformWithOxc(source.slice(source.indexOf('export default function')).replace('export default ',''),'dropdowns.jsx',{jsx:{runtime:'classic'}});
const names=['REPAIR_TYPES','breakdownCategories','breakdownSubCategories','categoriesForRepairType','subCategoriesForCategory','categoryLabel','repairTypeKey'];
function harness(props){let state=[],index=0;const useState=initial=>{const i=index++;if(!(i in state))state[i]=initial;return [state[i],v=>state[i]=v];};const Component=new Function('React','useState',...names,code+';return RepairClassificationFields;')(React,useState,...names.map(name=>helpers[name]));return ()=>{index=0;return Component(props);};}
const descendants=(node)=>React.isValidElement(node)?[node,...React.Children.toArray(node.props.children).flatMap(descendants)]:[];
const select=(tree,name)=>descendants(tree).find(node=>node.type==='select'&&node.props.name===name);
const options=node=>React.Children.toArray(node.props.children).filter(child=>child.type==='option').map(child=>child.props.children);
const other=name=>/^others?$/i.test(String(name).trim());

test('WGM and Scheduled hide both Other spellings in fallback and master-backed dropdowns',()=>{
 for(const repairType of ['WGM','Scheduled'])for(const masterBacked of [false,true]){
  const breakdownCategory=repairType==='WGM'?'WGM':'SCHEDULED SERVICE';
  const props={initial:{repairType},required:true,...(masterBacked?{categoryRecords:[{breakdownCategory}, {breakdownCategory:'Other'},{breakdownCategory:'OTHERS'}],subCategoryRecords:[{breakdownCategory,subCategory:repairType==='WGM'?'WGM':'HOUR SERVICE 250'},{breakdownCategory,subCategory:'Other'},{breakdownCategory,subCategory:' oThErS '}]}:{})};
  const before=structuredClone(props),tree=harness(props)();
  assert.ok(!options(select(tree,'breakdownCategory')).some(other));
  assert.ok(!options(select(tree,'breakdownSubCategory')).some(other));
  assert.equal(select(tree,'breakdownCategory').props.value,breakdownCategory);
  if(repairType==='WGM')assert.equal(select(tree,'breakdownSubCategory').props.value,'WGM');
  assert.deepEqual(props,before);
 }
});

test('saved historical catch-all values remain unchanged until the user chooses a replacement',()=>{
 for(const repairType of ['WGM','Scheduled'])for(const catchAll of ['Other','Others']){
  const initial={repairType,breakdownCategory:repairType==='WGM'?'WGM':'SCHEDULED SERVICE',breakdownSubCategory:catchAll};
  const render=harness({initial,required:true});let tree=render();
  const saved=Object.fromEntries(descendants(tree).filter(node=>node.type==='input'&&node.props.type==='hidden').map(node=>[node.props.name,node.props.value]));
  assert.deepEqual(saved,initial);assert.ok(!descendants(tree).some(node=>node.type==='select'));
  descendants(tree).find(node=>node.type==='button').props.onClick();tree=render();
  assert.ok(select(tree,'breakdownCategory'));assert.ok(!options(select(tree,'breakdownSubCategory')).some(other));
  assert.equal(initial.breakdownSubCategory,catchAll);
 }
});

test('other repair types retain their existing catch-all options',()=>{
 for(const repairType of ['Preventive','Breakdown','Accidental']){
  const render=harness({initial:{repairType}});let tree=render();
  assert.ok(options(select(tree,'breakdownCategory')).includes('Other'));
  select(tree,'breakdownCategory').props.onChange({target:{value:'Other'}});tree=render();
  assert.ok(options(select(tree,'breakdownSubCategory')).includes('Other'));
 }
});
