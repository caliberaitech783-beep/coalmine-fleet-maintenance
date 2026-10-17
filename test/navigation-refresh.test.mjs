import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {configureNavigation, navigationScope, readNavigation, writeNavigation, resetNavigation} from '../src/navigation-state.mjs';
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const user={token:'test-session',id:1,name:'User',role:'super'};

test('reload restores a master page and independent nested tabs without storing credentials',()=>{
 const saved=storage();configureNavigation(user);
 writeNavigation('app.page','Equipment master',saved);
 writeNavigation('workspace.MIS User.portal.tab','verify',saved);
 writeNavigation('main.selectedReportByCategory',{production:'Maintenance Status Pending'},saved);
 configureNavigation(user);
 assert.equal(readNavigation('app.page','Dashboard',saved),'Equipment master');
 assert.equal(readNavigation('workspace.MIS User.portal.tab','requests',saved),'verify');
 assert.deepEqual(readNavigation('main.selectedReportByCategory',{},saved),{production:'Maintenance Status Pending'});
 assert.ok(!saved.getItem('pulse.navigation.v1').includes(user.token));
 assert.equal(readNavigation('app.page','Dashboard',storage()),'Dashboard');
});

test('another account, logout, and a fresh login cannot inherit previous navigation',()=>{
 const saved=storage();configureNavigation(user);writeNavigation('app.page','Equipment master',saved);
 configureNavigation({...user,id:2});assert.equal(readNavigation('app.page','Dashboard',saved),'Dashboard');
 configureNavigation(user);resetNavigation(saved);assert.equal(readNavigation('app.page','Dashboard',saved),'Dashboard');
 configureNavigation(null);writeNavigation('app.page','Reports',saved);assert.equal(saved.getItem('pulse.navigation.v1'),null);
});

test('broken, blocked, and incompatible saved storage safely uses the default',()=>{
 configureNavigation(user);const saved=storage();saved.setItem('pulse.navigation.v1','broken json');
 assert.equal(readNavigation('app.page',()=> 'Dashboard',saved),'Dashboard');
 writeNavigation('app.page',{},saved);assert.equal(readNavigation('app.page','Dashboard',saved),'Dashboard');
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 assert.equal(readNavigation('app.page','Dashboard',blocked),'Dashboard');
 assert.doesNotThrow(()=>writeNavigation('app.page','Reports',blocked));assert.doesNotThrow(()=>resetNavigation(blocked));
});

test('navigation hook restores after remount, supports updater functions, and isolates workspace keys',async()=>{
 const source=(await readFile(new URL('../src/navigation-state.jsx',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export \{.*;\r?\n/gm,'').replace('export function','function');
 const saved=storage();configureNavigation(user);
 let slots=[],cursor=0;
 const useState=initial=>{const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],next=>slots[i]=typeof next==='function'?next(slots[i]):next];};
 const useRef=initial=>{const i=cursor++;return slots[i]??(slots[i]={current:initial});};
 const hook=new Function('useState','useRef','useCallback','navigationScope','readNavigation','writeNavigation',source+';return useNavigationState;')(useState,useRef,fn=>fn,navigationScope,(key,initial)=>readNavigation(key,initial,saved),(key,value)=>writeNavigation(key,value,saved));
 const render=(key,initial)=>{cursor=0;return hook(key,initial);};
 let [value,set]=render('reports',{});set(current=>({...current,production:'Pending'}));set(current=>({...current,mis:'First trip'}));
 slots=[];assert.deepEqual(render('reports',{})[0],{production:'Pending',mis:'First trip'});
 assert.equal(render('production.tab','requests')[0],'requests');render('production.tab','requests')[1]('history');
 assert.equal(render('mis.tab','requests')[0],'requests');assert.equal(render('production.tab','requests')[0],'history');
 resetNavigation(saved);configureNavigation({...user,id:2});assert.equal(render('production.tab','requests')[0],'requests');
});
