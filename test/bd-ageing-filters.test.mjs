import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bdAgeingView} from '../src/bd-ageing-filters.mjs';
const groups=[{id:'2-4',label:'2–4 days',rows:[{ref:'a',site:'Sasti OB',ageMilliseconds:3},{ref:'b',site:'Jayant OC',ageMilliseconds:2}]},{id:'4-6',label:'4–6 days',rows:[{ref:'c',site:'Sasti OC',ageMilliseconds:5},{ref:'d',site:'Majri OC',ageMilliseconds:4}]},{id:'over-6',label:'More than 6 days',rows:[{ref:'e',site:'Jayant OC',ageMilliseconds:8}]}];
test('one combined view defaults to all ageing sorted oldest first',()=>{
 const view=bdAgeingView(groups);assert.deepEqual(view.rows.map(row=>row.ref),['e','c','d','a','b']);
 assert.deepEqual(view.tabs.map(tab=>tab.count),[5,2,2,1]);assert.deepEqual(view.regions,['NCL','WCL']);
});
test('region narrows sites and counts, site aliases combine, ageing narrows the same export rows',()=>{
 const region=bdAgeingView(groups,{region:'WCL'});assert.deepEqual(region.sites.map(s=>s.label),['Majri OC','Sasti OC']);
 const site=region.sites.find(s=>s.label==='Sasti OC').key;
 const view=bdAgeingView(groups,{region:'WCL',site,ageing:'4-6'});
 assert.deepEqual(view.rows.map(row=>row.ref),['c']);assert.deepEqual(view.tabs.map(tab=>tab.count),[2,1,1,0]);
 assert.equal(bdAgeingView(groups,{region:'NCL',site}).rows.length,0);
});
test('empty and unknown locations remain safe and do not add records',()=>{
 assert.deepEqual(bdAgeingView().rows,[]);
 const view=bdAgeingView([{id:'over-6',label:'More than 6 days',rows:[{ref:'x',site:'',ageMilliseconds:8}]}]);
 assert.equal(view.rows[0].region,'Other');assert.equal(view.rows[0].site,'Not assigned');
 assert.equal(bdAgeingView(groups,{region:'unknown'}).rows.length,0);
});
test('component renders one shared table with accessible tabs and dependent site reset',()=>{
 const ui=readFileSync(new URL('../src/bd-ageing-report.jsx',import.meta.url),'utf8');
 assert.equal((ui.match(/<ReportSection\s/g)||[]).length,1);
 assert.match(ui,/rows=\{view.rows\}/);assert.match(ui,/role="tablist"/);assert.match(ui,/role="tabpanel"/);
 assert.match(ui,/setRegion\(event.target.value\);setSite\('all'\)/);
 assert.match(ui,/canViewBdAgeingReport\(session\)/);
});
