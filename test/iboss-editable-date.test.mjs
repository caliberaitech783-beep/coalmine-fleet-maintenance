import test from 'node:test';import assert from 'node:assert/strict';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import EditableDateInput,{parseTypedDate,typedDateDisplay,typedDateRange} from '../src/iboss-editable-date.mjs';
test('typed dashboard dates support day-first numbers, month names and ISO without rollover',()=>{
 for(const text of ['30-09-2026','30/09/2026','30-Sep-2026','2026-09-30','30-09-26'])assert.equal(parseTypedDate(text),'2026-09-30');
 for(const text of ['31-09-2026','29-02-2025','00-10-2026','10-13-2026','1',''])assert.equal(parseTypedDate(text),'');
 assert.equal(parseTypedDate('29-02-2024'),'2024-02-29');assert.equal(typedDateDisplay('2026-09-30'),'30-09-2026');assert.equal(typedDateDisplay('30-0'),'30-0');
 assert.deepEqual(typedDateRange({from:'01-04-2026',to:'30-Sep-2026'}),{from:'2026-04-01',to:'2026-09-30'});
 assert.throws(()=>typedDateRange({from:'01-10-2026',to:'30-09-2026'}));
});
test('dashboard date offers an editable text box and a separate labelled calendar',()=>{
 const html=renderToStaticMarkup(React.createElement(EditableDateInput,{value:'2026-09-30',label:'Activity from',onChange:()=>{}}));
 assert.match(html,/type="text"/);assert.match(html,/value="30-09-2026"/);assert.match(html,/type="date"/);assert.match(html,/Choose Activity from from calendar/);assert.doesNotMatch(html,/readonly|disabled/);
});
