import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BREAKDOWN_SUB_CATEGORY_DEFAULTS,BREAKDOWN_SUB_CATEGORY_FIELD,BREAKDOWN_SUB_CATEGORY_MASTER,breakdownSubCategoryNames} from '../breakdown-sub-category.mjs';
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

test('sub-category names are trimmed, de-duplicated and sorted',()=>{
  assert.deepEqual(breakdownSubCategoryNames([{subCategory:' clutch '},{subCategory:'Battery'},'CLUTCH',{subCategory:''},{},null,{subCategory:'Air  conditioning'}]),['Air conditioning','Battery','clutch']);
  assert.deepEqual(breakdownSubCategoryNames(),[]);
});

test('it is a Masters sub menu that administrators can add to, edit and delete, controlled from Privilege',()=>{
  assert.match(client,/\["Repair type master", Wrench\],\n  \["Breakdown Sub-Category", Wrench\],\n  \["Region master", Building2\],/,'listed in the Masters menu after Repair type master');
  assert.match(client,/"Breakdown Sub-Category": \[\n    \["subCategory", "Sub-Category"\],\n  \],/);
  assert.match(client,/name === "Repair type master" \|\| name === "Breakdown Sub-Category" \|\| name === "Delayed Reason"/,'rows can be added, edited and deleted');
  assert.ok(ADMIN_MASTER_OPTIONS.includes('Breakdown Sub-Category'),'it can be ticked under Visible masters in Privilege');
  assert.equal(ADMIN_MASTER_OPTIONS[ADMIN_MASTER_OPTIONS.indexOf('Repair type master')+1],'Breakdown Sub-Category');
  assert.equal(masterAccessAllows({adminLevel:'Admin'},'Breakdown Sub-Category'),true);
  assert.equal(masterAccessAllows({adminLevel:'Manager',masterAccess:['Equipment master']},'Breakdown Sub-Category'),false);
});

test('the server seeds the list once and never re-creates rows an administrator removed',()=>{
  assert.match(server,/import \{BREAKDOWN_SUB_CATEGORY_DEFAULTS\} from '\.\/breakdown-sub-category\.mjs';/);
  assert.match(server,/key='breakdown_sub_category_defaults_seeded_v1' FOR UPDATE/);
  assert.match(server,/if\(!subCategorySeed\.length\)\{\n\s+for\(const subCategory of BREAKDOWN_SUB_CATEGORY_DEFAULTS\)\{/);
  assert.match(server,/lower\(trim\(record_data->>'subCategory'\)\)=lower\(trim\(\$3\)\)/,'an existing row with the same name is not duplicated');
  assert.match(server,/\['Breakdown Sub-Category',JSON\.stringify\(\{subCategory\}\),subCategory\]/);
});
