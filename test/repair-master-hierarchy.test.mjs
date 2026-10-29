import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {CLASSIFICATION_MAPPINGS,categoriesForRepairType,categoryOfMapping,validateClassification,requestCategoryLabel} from '../repair-classification.mjs';
import {BREAKDOWN_SUB_CATEGORY_MAPPINGS} from '../breakdown-sub-category.mjs';
import {seedRepairClassificationMasters} from '../repair-classification-seed.mjs';
import {breakdownCategoryShare} from '../dashboard-breakdown-movement.mjs';

test('approved master migration inserts missing Excel rows once and preserves every existing row and request',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE master_records(id serial PRIMARY KEY,master_name text,record_data jsonb);
   CREATE TABLE app_metadata(key text PRIMARY KEY,value text,updated_at timestamptz);
   CREATE TABLE maintenance_requests(reference text,category text,classification jsonb);
   CREATE TABLE saved_table_reports(id int,state jsonb);
   INSERT INTO maintenance_requests VALUES('HISTORICAL','Engine',NULL),('CLASSIFIED','WGM','{"version":1,"repairType":"WGM","breakdownCategory":"WGM","breakdownSubCategory":"WGM"}');
   INSERT INTO saved_table_reports VALUES(1,'{"name":"Ongoing report","formula":"Unchanged"}');`);
  for(const mapping of BREAKDOWN_SUB_CATEGORY_MAPPINGS)await db.query("INSERT INTO master_records(master_name,record_data) VALUES('Breakdown Sub-Category',$1::jsonb)",[JSON.stringify(mapping)]);
  const before=(await db.query('SELECT * FROM master_records ORDER BY id')).rows;
  const requests=(await db.query('SELECT * FROM maintenance_requests ORDER BY reference')).rows;
  const reports=(await db.query('SELECT * FROM saved_table_reports')).rows;
  await seedRepairClassificationMasters(db);
  const after=(await db.query('SELECT * FROM master_records ORDER BY id')).rows;
  assert.deepEqual(after.slice(0,before.length),before);
  const mappings=after.filter(row=>row.master_name==='Breakdown Sub-Category').map(row=>row.record_data);
  assert.equal(mappings.length,134);
  for(const row of CLASSIFICATION_MAPPINGS)assert.ok(mappings.some(saved=>categoryOfMapping(saved)===row.breakdownCategory&&saved.subCategory===row.subCategory));
  const categories=after.filter(row=>row.master_name==='Breakdown Category').map(row=>row.record_data);
  for(const type of ['Breakdown','Preventive','Accidental']){const names=categoriesForRepairType(type,categories);assert.ok(names.includes('DRIVELINE/AGGREGATE'));assert.ok(!names.includes('WGM'));assert.ok(!names.includes('SCHEDULED SERVICE'));}
  assert.deepEqual(categoriesForRepairType('WGM',categories),['WGM']);
  assert.deepEqual(categoriesForRepairType('Scheduled',categories),['SCHEDULED SERVICE']);
  for(const row of CLASSIFICATION_MAPPINGS)assert.deepEqual(validateClassification(row.breakdownCategory==='WGM'?'WGM':row.breakdownCategory==='SCHEDULED SERVICE'?'Scheduled':'Breakdown',row.breakdownCategory,row.subCategory,categories,mappings),row);
  await seedRepairClassificationMasters(db);
  assert.deepEqual((await db.query('SELECT * FROM master_records ORDER BY id')).rows,after);
  assert.deepEqual((await db.query('SELECT * FROM maintenance_requests ORDER BY reference')).rows,requests);
  assert.deepEqual((await db.query('SELECT * FROM saved_table_reports')).rows,reports);
 }finally{await db.close();}
});

test('category dashboard reads existing deployed classifications without rewriting history',()=>{
 const rows=[{category:'Engine'},{category:'ENGINE',classification:{version:1,repairType:'Breakdown',breakdownCategory:'ENGINE'}},{category:'ENGINE',classification:{version:1,repairType:'Preventive',breakdownCategory:'ENGINE'}}];
 const result=breakdownCategoryShare(rows,'','',[{breakdownCategory:'ENGINE'},{breakdownCategory:'WGM'}]);
 assert.deepEqual(result.find(row=>row.label==='ENGINE'),{label:'ENGINE',count:2,percentage:67});
 assert.deepEqual(result.find(row=>row.label==='Unclassified'),{label:'Unclassified',count:1,percentage:33});
 assert.equal(result.find(row=>row.label==='WGM').count,0);
 assert.equal(requestCategoryLabel(rows[0]),'Unclassified');
});
