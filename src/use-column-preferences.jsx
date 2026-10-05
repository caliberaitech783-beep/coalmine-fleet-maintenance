import {useState} from 'react';
import {tableLayoutAccount,tableLayoutStorageKey} from './table-layouts.mjs';
import {restoreColumnOrder,storeColumnOrder} from './table-actions-model.mjs';

// Use account + stable table/schema identity, never a changing site/date heading.
export function useColumnPreferences(table,columns,fallback) {
  let storageKey='';
  try {storageKey=tableLayoutStorageKey(tableLayoutAccount(),table,columns)+':applied';} catch {}
  const defaults=columns.map(column=>column.key);
  const read=()=>{
    try {if(storageKey && localStorage.getItem(storageKey))return restoreColumnOrder(storageKey,defaults);} catch {}
    return fallback?.length?fallback:defaults;
  };
  const [state,setState]=useState(()=>({storageKey,keys:read()}));
  const keys=state.storageKey===storageKey?state.keys:read();
  const apply=next=>{
    if(storageKey)storeColumnOrder(storageKey,next,defaults);
    setState({storageKey,keys:next});
  };
  return [keys,apply];
}
