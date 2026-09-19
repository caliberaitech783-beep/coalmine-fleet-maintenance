import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BREAKDOWN_SUB_CATEGORY_DEFAULTS,BREAKDOWN_SUB_CATEGORY_FIELD,BREAKDOWN_SUB_CATEGORY_MASTER,BREAKDOWN_SUB_CATEGORY_OTHERS,breakdownSubCategoryNames} from '../breakdown-sub-category.mjs';
import {ADMIN_MASTER_OPTIONS,masterAccessAllows} from '../admin-access.mjs';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const server=read('../server.mjs'),client=read('../src/main.jsx');

test('the Breakdown Sub-Category master carries the owner\'s 33 sub-categories',()=>{
  assert.equal(BREAKDOWN_SUB_CATEGORY_MASTER,'Breakdown Sub-Category');
  assert.equal(BREAKDOWN_SUB_CATEGORY_FIELD,'subCategory');
  assert.equal(BREAKDOWN_SUB_CATEGORY_DEFAULTS.length,33);
  assert.equal(new Set(BREAKDOWN_SUB_CATEGORY_DEFAULTS.map((name)=>name.toLowerCase())).size,33,'no duplicates');
  for(const name of BREAKDOWN_SUB_CATEGORY_DEFAULTS){assert.equal(name,name.trim());assert.match(name,/^[A-Z]/,name);}
  assert.deepEqual(BREAKDOWN_SUB_CATEGORY_DEFAULTS.slice(0,3),['Tyre puncture','Leaf spring broken','Hollow spring']);
  assert.equal(BREAKDOWN_SUB_CATEGORY_DEFAULTS.at(-1),'Bucket tooth wornout');
  assert.ok(BREAKDOWN_SUB_CATEGORY_DEFAULTS.includes('Travel device'),'trailing spaces in the sheet are removed');
  assert.ok(BREAKDOWN_SUB_CATEGORY_DEFAULTS.includes('Swing motor'),'first letters are capitalised');
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
  assert.equal(seeded.length,34);
  assert.equal(seeded[0],'Adaptor issue');
  assert.equal(seeded.at(-1),'Others');
});

test('it is a Masters sub menu that administrators can add to, edit and delete, controlled from Privilege',()=>{
  assert.match(client,/\["Repair type master", Wrench, "repair"\],\n  \["Breakdown Sub-Category", Wrench, "subcategory"\],\n  \["Region master", Building2, "region"\],/,'listed in the Masters menu after Repair type master');
  assert.match(client,/"Breakdown Sub-Category": \[\n    \["subCategory", "Sub-Category"\],\n  \],/);
  assert.match(client,/name === "Repair type master" \|\| name === "Breakdown Sub-Category" \|\| name === "Delayed Reason"/,'rows can be added, edited and deleted');
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

test('the create request form loads the master and the server stores the chosen sub-category with the request',()=>{
  assert.match(client,/import \{ breakdownSubCategoryNames \} from "\.\.\/breakdown-sub-category\.mjs";/);
  assert.match(client,/useMasterRecords\("Breakdown Sub-Category"\)/,'the request page loads the Breakdown Sub-Category master');
  assert.match(client,/<MaintenanceForm normal[^>]*subCategoryRecords=\{subCategoryRecords\} subCategoriesLoaded=\{subCategoriesLoaded\}/);
  const form=client.slice(client.indexOf('function MaintenanceForm('),client.indexOf('function Subsidiaries('));
  assert.match(form,/normalizedBreakdownType\(category\) === "Breakdown"/,'only the Breakdown type asks for a sub-category');
  assert.match(form, /<SearchableSelect[\s\S]*?name="subCategory"[\s\S]*?value=\{selectedSubCategory\}[\s\S]*?onChange=\{setSelectedSubCategory\}/);
  assert.doesNotMatch(form,/<select\n\s+name="subCategory"/,'the plain dropdown is gone');
  assert.match(form,/subCategory: String\(fd\.get\("subCategory"\) \|\| ""\)\.trim\(\),/);
  assert.match(server,/ADD COLUMN IF NOT EXISTS sub_category TEXT NOT NULL DEFAULT ''/);
  assert.match(server,/category, sub_category AS "subCategory", complaint,/,'requests return the stored sub-category');
  assert.match(server,/category='Maintenance request',subCategory='',complaint,/);
  assert.match(server,/const storedSubCategory=String\(subCategory\|\|''\)\.trim\(\)\.slice\(0,200\);/);
  assert.match(server,/superior_name,site,category,sub_category,complaint,/);
  assert.match(server,/\$9,\$10,\$11,\$23,\$12,\$13,\$22,\$14/,'the sub-category is bound to the new insert parameter');
  assert.match(server,/storedComplaintLanguage,storedSubCategory\]\);/);
});

test('request creators receive the Breakdown Sub-Category master from /api/masters',()=>{
  const route=server.slice(server.indexOf("app.get('/api/masters',"),server.indexOf("app.post('/api/masters/",server.indexOf("app.get('/api/masters',")));
  assert.match(route,/if\(row\.master_name==='Breakdown Sub-Category'&&!canViewRepairTypes\)continue;/,'production users who can pick a repair type also get its sub-categories');
  assert.match(route,/\['Equipment master','Repair type master','Breakdown Sub-Category','Delayed Reason'\]\.includes\(row\.master_name\)/);
  assert.match(route,/const subCategoryForRequests=row\.master_name==='Breakdown Sub-Category'&&canViewRepairTypes;/,'admin-level request creators get it even when the master is not ticked for them');
});

test('the server seeds the list once and never re-creates rows an administrator removed',()=>{
  assert.match(server,/import \{BREAKDOWN_SUB_CATEGORY_DEFAULTS\} from '\.\/breakdown-sub-category\.mjs';/);
  assert.match(server,/key='breakdown_sub_category_defaults_seeded_v1' FOR UPDATE/);
  assert.match(server,/if\(!subCategorySeed\.length\)\{\n\s+for\(const subCategory of BREAKDOWN_SUB_CATEGORY_DEFAULTS\)\{/);
  assert.match(server,/lower\(trim\(record_data->>'subCategory'\)\)=lower\(trim\(\$3\)\)/,'an existing row with the same name is not duplicated');
  assert.match(server,/\['Breakdown Sub-Category',JSON\.stringify\(\{subCategory\}\),subCategory\]/);
});
