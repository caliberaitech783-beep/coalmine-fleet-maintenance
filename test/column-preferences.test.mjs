import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tableLayoutStorageKey} from '../src/table-layouts.mjs';
import {restoreColumnOrder,storeColumnOrder} from '../src/table-actions-model.mjs';

test('applied columns survive remounts, remain account scoped, and update only when applied',()=>{
  const previous=globalThis.localStorage;
  const data=new Map();
  globalThis.localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  try {
    let account='user-a';
    const source=readFileSync(new URL('../src/use-column-preferences.jsx',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export function','function');
    const mount=()=>{
      let state;
      return new Function('useState','tableLayoutAccount','tableLayoutStorageKey','restoreColumnOrder','storeColumnOrder',`${source};return useColumnPreferences;`)(initial=>{state??=initial();return [state,next=>{state=next;}];},()=>account,tableLayoutStorageKey,restoreColumnOrder,storeColumnOrder);
    };
    const columns=['shift','door','status'].map(key=>({key}));
    const first=mount();first('shared-table',columns)[1](['status','door']);
    assert.deepEqual(mount()('shared-table',columns)[0],['status','door']);
    account='user-b';assert.deepEqual(first('shared-table',columns)[0],['shift','door','status']);
    account='user-a';
    assert.deepEqual(mount()('other-table',columns)[0],['shift','door','status']);
    mount()('shared-table',columns)[1](['door']);
    assert.deepEqual(mount()('shared-table',columns)[0],['door']);
  }finally {globalThis.localStorage=previous;}
});
