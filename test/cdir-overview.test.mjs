import assert from 'node:assert/strict';
import test from 'node:test';
import {directoryLeadership,directorySiteTabs} from '../src/cdir-overview.mjs';
test('leadership includes every filled A and A1 role without a ten-row cap',()=>{
 const rows=Array.from({length:15},(_,i)=>({name:'Leader '+i,cat:i<5?'A':'A1',designation:'Engineer',status:'ACTIVE'}));
 assert.equal(directoryLeadership([...rows,{name:'Other',cat:'A2'},{name:'Vacancy',cat:'A1',status:'VACANT'}]).length,15);
});
test('site tabs contain only assigned operational sites including secondary assignments',()=>{
 const sites=[{id:'office',label:'Corporate Office, Nagpur'},{id:'a',label:'Sasti OC',group:'WCL'},{id:'b',label:'Jayant OC',group:'NCL'},{id:'c',label:'Majri OC',group:'WCL'}];
 assert.deepEqual(directorySiteTabs(sites,{siteIds:['a','b','office']}),sites.slice(1,3));
 assert.deepEqual(directorySiteTabs(sites,{}),[]);
});
