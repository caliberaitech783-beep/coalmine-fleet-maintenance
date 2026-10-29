import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import React from 'react';
import {transformWithOxc} from 'vite';
import {classificationError,newClassification,updateClassification,REPAIR_TYPES,breakdownCategories,breakdownSubCategories,categoriesForRepairType,subCategoriesForCategory,categoryLabel,repairTypeKey,CLASSIFICATION_MAPPINGS} from '../repair-classification.mjs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
test('locked maintenance writes persist the hierarchy and preserve every legacy ticket',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE maintenance_requests(reference text PRIMARY KEY,category text,sub_category text,classification jsonb);
      INSERT INTO maintenance_requests VALUES('OLD','Obsolete category','Obsolete component',NULL),('NEW','Maintenance request','',NULL);`);
    const start=source.indexOf('async function saveRequestClassification('),end=source.indexOf('async function requestSubCategory(',start);
    const save=new Function('updateClassification','classificationError','readClassificationMasters',source.slice(start,end)+';return saveRequestClassification;')(updateClassification,classificationError,async()=>({categories:[...new Set([...CLASSIFICATION_MAPPINGS.map(row=>row.breakdownCategory),'Other'])].map(breakdownCategory=>({breakdownCategory})),mappings:[...CLASSIFICATION_MAPPINGS,{breakdownCategory:'Other',subCategory:'Other'}]}));
    const req={session:{assignedRole:'Maintenance User'},body:{}};
    const legacy={ref:'OLD',category:'Obsolete category',subCategory:'Obsolete component',classification:null};
    assert.equal(await save(db,req,legacy,{version:1}),legacy);
    const before={ref:'NEW',category:'Maintenance request',subCategory:'',classification:newClassification({},'2026-10-28T17:00:00+05:30')};
    await assert.rejects(()=>save(db,req,before),/Select Repair type/);
    const input={repairType:'Scheduled',breakdownCategory:'SCHEDULED SERVICE',breakdownSubCategory:'HOUR SERVICE 250'};
    const saved=await save(db,req,before,input);
    assert.equal(saved.classification.version,1);
    assert.equal(saved.category,'SCHEDULED SERVICE');
    const rows=(await db.query('SELECT * FROM maintenance_requests ORDER BY reference')).rows;
    assert.deepEqual(rows.find(row=>row.reference==='NEW').classification,{version:1,...input});
    assert.deepEqual(rows.find(row=>row.reference==='OLD'),{reference:'OLD',category:'Obsolete category',sub_category:'Obsolete component',classification:null});
    await assert.rejects(()=>save(db,req,saved,{...input,breakdownCategory:'ENGINE'}),/belonging/);
    const other={repairType:'Breakdown',breakdownCategory:'Other',breakdownSubCategory:'Other'};
    await save(db,req,saved,other);
    const otherRow=(await db.query("SELECT category,sub_category,classification FROM maintenance_requests WHERE reference='NEW'")).rows[0];
    assert.deepEqual(otherRow,{category:'Other',sub_category:'Other',classification:{version:1,...other}});
    const production={session:{assignedRole:'Production User'},body:{}};
    assert.equal((await save(db,production,before,{})).classification.repairType,'');
  } finally {await db.close();}
});

test('legacy sub-category prompts do not validate or query masters after rollout',async()=>{
  const start=source.indexOf('async function requestSubCategory('),end=source.indexOf("app.post('/api/requests',",start);
  const helper=new Function('classificationActive',source.slice(start,end)+';return requestSubCategory;')(()=>true);
  const client={query(){throw Error('Legacy update must not load or validate new mappings');}};
  assert.equal(await helper(client,'ENGINE','Oil Pump',true,{subCategory:'Old deleted value'}),'Old deleted value');
  assert.equal(await helper(client,'ENGINE','Oil Pump',true,{}),'');
});

test('real insert SQL persists new category, component and rollout marker together',async()=>{
  const db=new PGlite();
  try {
    const start=source.indexOf('    const result=await client.query(`INSERT INTO maintenance_requests',source.indexOf("app.post('/api/requests',"));
    const sql=source.slice(start,source.indexOf('\n    await client.query',start));
    const columns=sql.match(/\((reference,[^)]+)\)/)[1].split(',');
    await db.exec(`CREATE TABLE maintenance_requests(${columns.map(name=>`${name} ${name==='classification'?'jsonb':name==='acceptance_required'?'boolean':name==='started_at'?'timestamptz':'text'}`).join(',')});`);
    const classification=newClassification({repairType:'WGM',breakdownCategory:'WGM',breakdownSubCategory:'WGM'},'2026-10-28T17:00:00+05:30');
    const context={client:db,requestProjection:'reference AS ref,category,sub_category,classification',ref:'REQ-NEW',equipment:'Truck',equipmentGroup:'TIPPER',door:'D1',reg:'',chassis:'',storedDriverName:'',storedDriverSource:'',superior:'',storedSite:'Mine',storedCategory:'WGM',complaint:'Maintenance',complaintAudio:'',startedAt:new Date(),req:{session:{assignedRole:'Maintenance User'}},normalizedMeterType:'HMR',storedComplaintLanguage:'',storedSubCategory:'WGM',classification};
    const rows=await new Function(...Object.keys(context),`return (async()=>{${sql};return result.rows;})()`)(...Object.values(context));
    assert.deepEqual(rows,[{ref:'REQ-NEW',category:'WGM',sub_category:'WGM',classification}]);
  } finally {await db.close();}
});

test('selectors enforce order, optional production fields, and reset children after changes',async()=>{
  const jsx=readFileSync(new URL('../src/repair-classification-fields.jsx',import.meta.url),'utf8');
  const start=jsx.indexOf('export default function RepairClassificationFields');
  const {code}=await transformWithOxc(jsx.slice(start).replace('export default ',''),'fields.jsx',{jsx:{runtime:'classic'}});
  let states=[],index=0;
  const useState=initial=>{const position=index++;if(!(position in states))states[position]=initial;return [states[position],value=>{states[position]=value;}];};
  const Component=new Function('React','useState','REPAIR_TYPES','breakdownCategories','breakdownSubCategories','categoriesForRepairType','subCategoriesForCategory','categoryLabel','repairTypeKey',code+';return RepairClassificationFields;')(React,useState,REPAIR_TYPES,breakdownCategories,breakdownSubCategories,categoriesForRepairType,subCategoriesForCategory,categoryLabel,repairTypeKey);
  const fields=(props={})=>{index=0;return React.Children.toArray(Component(props).props.children).map(label=>React.Children.toArray(label.props.children).find(child=>child.type==='select'));};
  let selects=fields();
  assert.deepEqual(selects.map(field=>field.props.name),['repairType','breakdownCategory','breakdownSubCategory']);
  assert.ok(selects.every(field=>field.props.required===false));
  assert.ok(selects[1].props.disabled && selects[2].props.disabled);
  selects[0].props.onChange({target:{value:'Scheduled'}});
  selects=fields({required:true});
  assert.ok(selects.every(field=>field.props.required));
  assert.deepEqual(React.Children.toArray(selects[1].props.children).slice(1).map(option=>option.props.children),['SCHEDULED SERVICE']);
  selects[1].props.onChange({target:{value:'SCHEDULED SERVICE'}});
  selects=fields();selects[2].props.onChange({target:{value:'HOUR SERVICE 250'}});
  selects=fields();selects[0].props.onChange({target:{value:'WGM'}});
  selects=fields();assert.equal(selects[1].props.value,'WGM');assert.equal(selects[2].props.value,'WGM');
  assert.deepEqual(React.Children.toArray(selects[1].props.children).slice(1).map(option=>option.props.children),['WGM']);
  selects[0].props.onChange({target:{value:'Breakdown'}});selects=fields();
  selects[1].props.onChange({target:{value:'Other'}});
  selects=fields();
  assert.deepEqual(React.Children.toArray(selects[2].props.children).slice(1).map(option=>option.props.children),['Other']);
  selects[2].props.onChange({target:{value:'Other'}});
  selects=fields();assert.equal(selects[2].props.value,'Other');
});
