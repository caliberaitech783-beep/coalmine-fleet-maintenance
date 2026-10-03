import test from 'node:test';
import assert from 'node:assert/strict';
import {chatOptions,matchChatQuestion,filterChatOptions} from '../src/iboss-chat-options.mjs';
import {ACCOUNT_VIEWS} from '../iboss-accounts.mjs';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {indiaDateTimeInputValue} from '../report-date-range.mjs';
test('chat options stay within assigned report sections',()=>{
 assert.deepEqual(chatOptions([]),[]);
 const masters=chatOptions(['Masters']),transactions=chatOptions(['Transactions']);
 assert.ok(masters.some(o=>o.view==='day-book'));
 assert.ok(!masters.some(o=>o.view==='bank-balance'));
 assert.ok(transactions.some(o=>o.view==='bank-balance'));
 assert.ok(!transactions.some(o=>o.view==='vendor-master'));
 for(const option of [...masters,...transactions])assert.ok(ACCOUNT_VIEWS[option.view]);
});
test('guided questions resolve only supported requests without silently dropping filters',()=>{
 const options=chatOptions(['Masters','Transactions']);
 for(const phrase of ["Today's bank closing",'todays bank closing','bank balance'])assert.equal(matchChatQuestion(phrase,options).view,'bank-balance');
 assert.equal(matchChatQuestion('bank closing for SBI only',options),undefined);
 assert.equal(matchChatQuestion('delete a payment',options),undefined);
 assert.equal(matchChatQuestion('bank balance',chatOptions(['Masters'])),undefined);
 assert.ok(filterChatOptions('fixed deposit',options).length>=3);
});
test('chat renders suggested questions and date controls before fetching',async()=>{
 const source=readFileSync(new URL('../src/iboss-chat.jsx',import.meta.url),'utf8').replace(/^import .*;\r?$/gm,'').replace('export default function','function');
 const {code}=await transformWithOxc(source,'chat.jsx',{jsx:{runtime:'classic'}});
 const scope={React,useEffect:React.useEffect,useRef:React.useRef,useState:React.useState,chatOptions,filterChatOptions,indiaDateTimeInputValue,DateInput:()=>null};
 const Component=new Function(...Object.keys(scope),`${code};return IbossChat;`)(...Object.values(scope));
 const markup=renderToStaticMarkup(React.createElement(Component,{allowed:['Transactions']}));
 assert.match(markup,/Accounts Chat Bot/);assert.match(markup,/bank closing/);assert.match(markup,/To \/ balance date/);assert.doesNotMatch(markup,/Fetching ERP records/);
});
