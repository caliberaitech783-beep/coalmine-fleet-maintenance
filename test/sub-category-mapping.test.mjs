import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import React from 'react';
import {transformWithOxc} from 'vite';
import {BREAKDOWN_SUB_CATEGORY_MAPPINGS,subCategoriesForRepairType,validateRequestSubCategory} from '../breakdown-sub-category.mjs';

const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const mappings=BREAKDOWN_SUB_CATEGORY_MAPPINGS;
test('the four work categories share the complete approved component list',()=>{
  const expected=[...new Set(mappings.map(row=>row.subCategory))];
  for(const type of ['PREVENTIVE','ACCIDENTAL','AGGREGATE REPAIR','SCHEDULED SERVICE']){
    assert.deepEqual(subCategoriesForRepairType(type,mappings),expected,type);
    for(const name of expected)assert.equal(validateRequestSubCategory(type,name,mappings,{required:true}),name);
    assert.throws(()=>validateRequestSubCategory(type,'',mappings,{required:true}),/Select a sub-category/);
    assert.equal(validateRequestSubCategory(type,'',mappings),'','production can leave the selection empty');
    assert.throws(()=>validateRequestSubCategory(type,'Unlisted component',mappings,{required:true}),/belonging/);
  }
  assert.deepEqual(subCategoriesForRepairType('Preventive',[{repairType:'SUSPENSION',subCategory:'Administrator added component'}]),['Administrator added component']);
  assert.equal(subCategoriesForRepairType('SUSPENSION',mappings).length,9);
});
test('existing repair type labels fetch every corresponding Excel sub-category',()=>{
  const aliases={
    SUSPENSION:'SUSPENSION SYSTEM',
    'UNDER CARRIAGE/TRACK':'UNDERCARRIAGE / TRACK SYSTEM',
    'GROUND ENGAGING TOOLS (GET)':'GET',
    OTHERS:'other',
    'DRIVE LINE':'DRIVELINE',
    BRAKE:'BRAKING SYSTEM',
    STEERING:'STEERING SYSTEM',
    'AIR CONDITIONING':'AC SYSTEM',
    FUEL:'FUEL SYSTEM',
    COOLING:'COOLING SYSTEM',
    HYDRAULIC:'HYDRAULIC SYSTEM',
    LUBRICATION:'LUBRICATION SYSTEM',
    DRILLING:'DRILLING SYSTEM',
  };
  for(const [alias,canonical] of Object.entries(aliases)){
    const expected=mappings.filter(row=>row.repairType===canonical).map(row=>row.subCategory);
    assert.ok(expected.length,canonical);
    assert.deepEqual(subCategoriesForRepairType(alias,mappings),expected,alias);
    for(const name of expected)assert.equal(validateRequestSubCategory(alias,name,mappings,{required:true}),name);
  }
  assert.equal(subCategoriesForRepairType('SUSPENSION',mappings).length,9);
  assert.equal(subCategoriesForRepairType('UNDER CARRIAGE/TRACK',mappings).length,5);
  assert.equal(subCategoriesForRepairType('GROUND ENGAGING TOOLS (GET)',mappings).length,4);
  assert.throws(()=>validateRequestSubCategory('SUSPENSION','Engine',mappings,{required:true}),/belonging/);
  // Alias resolution also works for administrator-created rows using the old label.
  assert.deepEqual(subCategoriesForRepairType('SUSPENSION SYSTEM',[{repairType:'SUSPENSION',subCategory:'Leaf Spring'}]),['Leaf Spring']);
  assert.deepEqual(subCategoriesForRepairType('Hydraulic custom',mappings),[]);
});
test('all 122 spreadsheet mappings are present and restricted to their repair type',()=>{
  assert.equal(mappings.length,122);
  assert.equal(new Set(mappings.map(row=>row.repairType)).size,20);
  assert.deepEqual(mappings,JSON.parse(readFileSync(new URL('../breakdown-sub-category-data.json',import.meta.url),'utf8')));
  assert.deepEqual(subCategoriesForRepairType('Drive Line',mappings),['Engine','Transmission / Gearbox','Differential','Axle','Clutch','Flywheel']);
  assert.deepEqual(subCategoriesForRepairType('',mappings),[]);
  assert.deepEqual(subCategoriesForRepairType('unknown',mappings),[]);
  assert.ok(!subCategoriesForRepairType('DRIVELINE',mappings).includes('Battery'));
  assert.ok(subCategoriesForRepairType('ENGINE',mappings).includes('Water Pump'));
  assert.deepEqual(subCategoriesForRepairType('Other',mappings),['custom']);
  for(const row of mappings)assert.equal(validateRequestSubCategory(row.repairType,row.subCategory,mappings,{required:true}),row.subCategory);
  assert.equal(validateRequestSubCategory('DRIVELINE','',mappings),'');
  assert.throws(()=>validateRequestSubCategory('DRIVELINE','',mappings,{required:true}),/Select a sub-category/);
  assert.throws(()=>validateRequestSubCategory('DRIVELINE','Battery',mappings),/belonging/);
  assert.throws(()=>validateRequestSubCategory('unknown','Engine',mappings),/belonging/);
  assert.equal(validateRequestSubCategory('drive line',' engine ',mappings),'Engine');
});

test('migration replaces the flat master once, preserves the snapshot and requests, and respects later admin edits',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE master_records(id serial,master_name text,record_data jsonb);
      CREATE TABLE app_metadata(key text PRIMARY KEY,value text,updated_at timestamptz);
      CREATE TABLE maintenance_requests(reference text,sub_category text);
      INSERT INTO master_records(master_name,record_data) VALUES('Breakdown Sub-Category','{"subCategory":"Legacy fault"}'),('Users & employees','{"login":"owner"}'),('Repair type master','{"repairType":"Super Structure"}');
      INSERT INTO maintenance_requests VALUES('OLD','Legacy fault');`);
    const start=source.indexOf('    // Replace the legacy flat master once');
    const sqlCode=source.slice(start,source.indexOf('    for(const delayedReason',start));
    const migrate=new Function('client','BREAKDOWN_SUB_CATEGORY_MAPPINGS',`return (async()=>{${sqlCode}})()`);
    await migrate(db,mappings);
    assert.equal((await db.query("SELECT * FROM master_records WHERE master_name='Breakdown Sub-Category'")).rows.length,122);
    assert.equal((await db.query("SELECT * FROM master_records WHERE master_name='Repair type master'")).rows.length,20);
    assert.deepEqual((await db.query('SELECT * FROM maintenance_requests')).rows,[{reference:'OLD',sub_category:'Legacy fault'}]);
    assert.equal((await db.query("SELECT * FROM master_records WHERE master_name='Users & employees'")).rows.length,1);
    assert.match((await db.query("SELECT value FROM app_metadata WHERE key='breakdown_sub_category_before_excel_v2'")).rows[0].value,/Legacy fault/);
    await db.query("DELETE FROM master_records WHERE master_name='Breakdown Sub-Category' AND record_data->>'subCategory'='Clutch'");
    await migrate(db,mappings);
    assert.equal((await db.query("SELECT * FROM master_records WHERE master_name='Breakdown Sub-Category'")).rows.length,121);
  }finally{await db.close();}
});

test('dropdown filters options and applies optional production versus required maintenance behavior',async()=>{
  const start=ui.indexOf('function BreakdownSubCategorySelect(');
  const {code}=await transformWithOxc(ui.slice(start,ui.indexOf('function MaintenanceForm(',start)),'subcategory.jsx',{jsx:{runtime:'classic'}});
  let current='Engine';
  const Component=new Function('React','useState','useMasterRecords','subCategoriesForRepairType',`${code};return BreakdownSubCategorySelect;`)(React,()=>[current,value=>{current=value;}],()=>[mappings,null,true],subCategoriesForRepairType);
  const select=tree=>React.Children.toArray(tree.props.children).find(node=>node.type==='select');
  let field=select(Component({category:'DRIVELINE'}));
  assert.equal(field.props.required,false);
  assert.equal(field.props.value,'Engine');
  field.props.onChange({target:{value:'Clutch'}});
  field=select(Component({category:'ELECTRICAL',required:true}));
  assert.equal(field.props.required,true);
  assert.equal(field.props.value,'','a stale selection cannot be submitted for a different repair type');
  const options=React.Children.toArray(field.props.children).filter(node=>node.props.value);
  assert.ok(options.some(node=>node.props.value==='Battery'));
  assert.ok(!options.some(node=>node.props.value==='Clutch'));
  assert.equal(select(Component({category:''})).props.disabled,true);
});

test('creation SQL persists the validated sub-category and permits an empty production selection',async()=>{
  const db=new PGlite();
  try{
    const start=source.indexOf('    const result=await client.query(`INSERT INTO maintenance_requests',source.indexOf("app.post('/api/requests',"));
    const end=source.indexOf('\n    await client.query',start);
    const insert=source.slice(start,end);
    const columns=insert.match(/\((reference,[^)]+)\)/)[1].split(',');
    await db.exec(`CREATE TABLE maintenance_requests(${columns.map(name=>`${name} ${name==='acceptance_required'?'boolean':name==='started_at'?'timestamptz':'text'}`).join(',')});`);
    const context={client:db,requestProjection:'reference AS ref,sub_category AS "subCategory"',ref:'REQ-SUB',equipment:'Truck',equipmentGroup:'TIPPER',door:'D1',reg:'R1',chassis:'CH1',storedDriverName:'',storedDriverSource:'',superior:'',storedSite:'Site',category:'DRIVELINE',complaint:'Noise',complaintAudio:'',startedAt:new Date(),req:{session:{name:'Operator',login:'production',assignedRole:'Production User'}},normalizedMeterType:'KMR',storedComplaintLanguage:'en',storedSubCategory:validateRequestSubCategory('DRIVELINE','Engine',mappings)};
    const save=new Function(...Object.keys(context),`return (async()=>{${insert};return result;})()`);
    let result=await save(...Object.values(context));
    assert.deepEqual(result.rows,[{ref:'REQ-SUB',subCategory:'Engine'}]);
    context.ref='REQ-OPTIONAL';context.storedSubCategory=validateRequestSubCategory('DRIVELINE','',mappings);
    result=await save(...Object.values(context));
    assert.deepEqual(result.rows,[{ref:'REQ-OPTIONAL',subCategory:''}]);
  }finally{await db.close();}
});
