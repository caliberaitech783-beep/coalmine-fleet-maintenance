import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BREAKDOWN_SUB_CATEGORY_DEFAULTS,BREAKDOWN_SUB_CATEGORY_FIELD,BREAKDOWN_SUB_CATEGORY_MASTER,BREAKDOWN_SUB_CATEGORY_OTHERS,breakdownSubCategoryNames} from '../breakdown-sub-category.mjs';
import {ADMIN_MASTER_OPTIONS,masterAccessAllows} from '../admin-access.mjs';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const server=read('../server.mjs'),client=read('../src/main.jsx');

test('the Breakdown Sub-Category master carries the spreadsheet sub-categories',()=>{
  assert.equal(BREAKDOWN_SUB_CATEGORY_MASTER,'Breakdown Sub-Category');
  assert.equal(BREAKDOWN_SUB_CATEGORY_FIELD,'subCategory');
  assert.equal(BREAKDOWN_SUB_CATEGORY_DEFAULTS.length,122);
  assert.deepEqual(BREAKDOWN_SUB_CATEGORY_DEFAULTS.slice(0,6),['Engine','Transmission / Gearbox','Differential','Axle','Clutch','Flywheel']);
});

test('sub-category names are trimmed, de-duplicated and sorted, and Others is always the last option',()=>{
  assert.deepEqual(breakdownSubCategoryNames([{subCategory:' clutch '},{subCategory:'Battery'},'CLUTCH',{subCategory:''},{},null,{subCategory:'Air  conditioning'}]),['Air conditioning','Battery','clutch','Others']);
  assert.deepEqual(breakdownSubCategoryNames(),[],'an empty master still offers nothing at all');
  assert.equal(BREAKDOWN_SUB_CATEGORY_OTHERS,'Others');
  const withOthers=breakdownSubCategoryNames([{subCategory:'Others'},{subCategory:'Battery'},{subCategory:'Air conditioning'}]);
  assert.deepEqual(withOthers,['Air conditioning','Battery','Others'],'a master row named Others moves to the end instead of sorting into the middle');
  assert.equal(withOthers.filter((name)=>/^others?$/i.test(name)).length,1,'Others is never duplicated');
  assert.deepEqual(breakdownSubCategoryNames([{subCategory:'other'},{subCategory:'Battery'}]),['Battery','other'],'a master row keeps its own spelling');
  const seeded=breakdownSubCategoryNames(BREAKDOWN_SUB_CATEGORY_DEFAULTS);
  assert.equal(seeded.length,123);
  assert.equal(seeded[0],'ABS / EBS');
  assert.equal(seeded.at(-1),'Others');
});

test('it is a Masters sub menu that administrators can add to, edit and delete, controlled from Privilege',()=>{
  assert.match(client,/\["Repair type master", Wrench, "repair"\],\n  \["Breakdown Category", Wrench, "repair"\],\n  \["Breakdown Sub-Category", Wrench, "subcategory"\],\n  \["Region master", Building2, "region"\],/,'listed in the Masters menu after Repair type master');
  assert.match(client,/"Breakdown Sub-Category": \[\n    \["repairType", "Breakdown Category"\],\n    \["subCategory", "Breakdown Sub-Category"\],\n  \],/);
  assert.match(client,/name === "Repair type master" \|\| name === "Breakdown Category" \|\| name === "Breakdown Sub-Category" \|\| name === "Delayed Reason"/,'rows can be added, edited and deleted');
  assert.ok(ADMIN_MASTER_OPTIONS.includes('Breakdown Sub-Category'),'it can be ticked under Visible masters in Privilege');
  assert.equal(ADMIN_MASTER_OPTIONS[ADMIN_MASTER_OPTIONS.indexOf('Repair type master')+1],'Breakdown Sub-Category');
  assert.equal(masterAccessAllows({adminLevel:'Admin'},'Breakdown Sub-Category'),true);
  const savedBeforeItExisted=['Users & employees','Equipment master','Breakdown master','Repair type master','Region master'];
  assert.equal(masterAccessAllows({adminLevel:'Admin',masterAccess:savedBeforeItExisted},'Breakdown Sub-Category'),true,'an Admin whose Visible masters list was saved before this master existed still sees it');
  assert.equal(masterAccessAllows({adminLevel:'Super Admin',masterAccess:savedBeforeItExisted},'Breakdown Sub-Category'),true);
  assert.equal(masterAccessAllows({adminLevel:'Manager',masterAccess:savedBeforeItExisted},'Breakdown Sub-Category'),false,'managers still need it ticked');
  assert.equal(masterAccessAllows({adminLevel:'Manager',masterAccess:[...savedBeforeItExisted,'Breakdown Sub-Category']},'Breakdown Sub-Category'),true);
  assert.equal(masterAccessAllows({adminLevel:'Manager',masterAccess:['Equipment master']},'Breakdown Sub-Category'),false);
});

test('request forms load the mapped master and new requests require selection from the cutoff',()=>{
  assert.match(client,/useMasterRecords\("Breakdown Sub-Category"\)/);
  assert.match(client,/<BreakdownSubCategorySelect key={selectedCategory} category={selectedCategory} required={requestRequiresSubCategory\(\)} \/>/);
  assert.match(client,/<BreakdownSubCategorySelect key={editCategory}[^\n]+ required \/>/);
  assert.match(server,/sub_category=\$15/);
});

test('request roles can read sub-categories without gaining master write permissions',()=>{
  assert.match(server,/\['Equipment master','Repair type master','Breakdown Category','Breakdown Sub-Category','Delayed Reason'\]\.includes\(row.master_name\)/);
  assert.match(server,/masterAccessAllows\(req.session.permissions,row.master_name==='Breakdown Category'\?'Repair type master':row.master_name\)/);
});
