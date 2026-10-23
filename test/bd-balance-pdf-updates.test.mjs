import test from 'node:test';
import assert from 'node:assert/strict';
import {bdBalancePdfColumns,isBdBalanceReport,latestBdBalanceUpdateText} from '../src/bd-balance-pdf-updates.mjs';
import {dailyUpdatesExportText} from '../src/daily-updates-order.mjs';
import {openSmartPrint} from '../src/smart-print.mjs';

const history=Array.from({length:7},(_,index)=>({createdAt:`2026-10-${String(16+index).padStart(2,'0')}T10:30:00+05:30`,authorName:`Author ${index+1}`,remark:`Work ${index+1}`,delayedReason:`Reason ${index+1}`}));
const columns=[{key:'door',label:'Door No',value:row=>row.door},{key:'dailyRemarks',label:'Daily updates',value:row=>dailyUpdatesExportText(row.requestDetails?.dailyRemarks||[])}];

test('every site BD Balance PDF keeps one row and only the latest update without mutating history',()=>{
 for(const site of ['Sasti OC','Majri OC','NCL','WCL','Jayant OC'])assert.ok(isBdBalanceReport(`${site} · Vehicles · BD Balance · WCL`));
 assert.equal(isBdBalanceReport('Daily breakdown updates'),false);
 const row={door:'S55',requestDetails:{dailyRemarks:[...history].reverse()}};
 const before=JSON.stringify(row),projected=bdBalancePdfColumns(columns);
 assert.equal(projected[0],columns[0]);
 const text=projected[1].value(row);
 assert.match(text,/Latest .*22-10-26/);
 assert.match(text,/By: Author 7\nUpdate: Work 7\nDelayed reason: Reason 7/);
 assert.doesNotMatch(text,/Work [1-6]|7 updates/);
 assert.equal(JSON.stringify(row),before);
 assert.equal(projected[1].value({door:'S60'}),'—');
});

test('rendered dashboard rows choose the latest update across AM/PM and date boundaries',()=>{
 const value='#1 | 11:30 PM 21-10-26 | By: A | Update: Older | Delayed reason: Old reason\n#2 | 5:00 AM 22-10-26 | By: B | Update: Latest | Delayed reason: New reason';
 assert.equal(latestBdBalanceUpdateText(['S55',value],value),'Latest 5:00 AM 22-10-26\nBy: B\nUpdate: Latest\nDelayed reason: New reason');
});

test('PDF download exports all 20 BD records once and no history appendix; other reports and Excel retain history',async()=>{
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.value='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){} addEventListener(){} showModal(){} close(){} remove(){}
 }
 const body=new Element('body'),data=new Map();
 const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
 const oldDocument=globalThis.document,oldWindow=globalThis.window;
 globalThis.document={body,createElement:tag=>new Element(tag)};
 globalThis.window={localStorage:storage,sessionStorage:storage};
 const all=node=>[node,...node.children.flatMap(all)];
 const rows=Array.from({length:20},(_,index)=>({door:`S${index}`,requestDetails:{dailyRemarks:index===0?history:[]}}));
 try{
  for(const [title,format] of [['Sasti OC · Vehicles · BD Balance · WCL','pdf'],['NCL · Equipment · BD Balance','pdf'],['Daily update report','pdf'],['BD Balance','xlsx']]){
   const exported=[];
   openSmartPrint({title,columns,rows,onExport:args=>exported.push(args),exportFormat:format,exportOnly:true});
   const nodes=all(body.children.at(-1));
   nodes.find(node=>node.textContent===`Download ${format==='pdf'?'PDF':'Excel'}`).onclick();
   await new Promise(resolve=>setTimeout(resolve,70));
   assert.equal(exported.length,1);
   assert.equal(exported[0].rows,rows);
   assert.equal(exported[0].rows.length,20);
   const text=exported[0].columns.find(column=>column.key==='dailyRemarks').value(rows[0]);
   if(format==='pdf'&&isBdBalanceReport(title)){
    assert.deepEqual(exported[0].appendices,[]);
    assert.match(text,/Work 7/);assert.doesNotMatch(text,/Work 1/);
    assert.equal(nodes.filter(node=>String(node.className||'').includes('smart-print-sheet')).length,1);
    assert.ok(nodes.some(node=>String(node.textContent||'').includes('no separate update-history section')));
   }else if(format==='pdf'){
    assert.equal(exported[0].appendices[0].rows.length,7);
   }else{
    assert.match(text,/Work 1/);assert.match(text,/Work 7/);
   }
  }
 }finally{globalThis.document=oldDocument;globalThis.window=oldWindow;}
});
