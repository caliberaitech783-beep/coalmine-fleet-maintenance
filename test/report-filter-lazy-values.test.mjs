import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {transformWithOxc} from 'vite';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const snippet=source.slice(source.indexOf('function TableParameterFilter('),source.indexOf('function exportCellText('));
const {code}=await transformWithOxc(snippet,'filter.jsx',{jsx:{runtime:'classic'}});
test('large summary filter opens without scanning rows and loads only the focused field',()=>{
  const slots=[];let cursor=0,calls=[];
  const scope={React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],v=>{slots[i]=v;}];},
    useRef:()=>({current:null}),useEffect:()=>{},useMemo:fn=>fn(),
    tableColumnValues(rows,column){calls.push(column.key);return [...new Set(rows.map(column.value))];},
    createPortal:node=>node,reportPortalTarget:()=>null,parseDateRange:()=>null,parseFilterValues:v=>v?[v]:[],
    EMPTY_TABLE_FILTER_VALUE:'__blank__',X:()=>null,ListFilter:()=>null};
  const Filter=new Function(...Object.keys(scope),code+';return TableParameterFilter;')(...Object.values(scope));
  const columns=Array.from({length:50},(_,i)=>({key:'c'+i,label:'Column '+i,value:r=>r.value}));
  const rows=Array.from({length:10000},(_,i)=>({value:String(i)}));
  const updates=[];const props={columns,rows,open:true,hideTrigger:true,dialogMode:true,filters:{c2:'saved'},onFilterChange:(...args)=>updates.push(args)};
  const render=()=>{cursor=0;return Filter(props);};
  const selects=tree=>{const found=[];function visit(n){if(Array.isArray(n))return n.forEach(visit);if(!React.isValidElement(n))return;if(n.type==='select')found.push(n);visit(n.props.children);}visit(tree);return found;};
  let fields=selects(render());
  assert.equal(fields.length,50);
  assert.deepEqual(calls,[],'opening the dialog does not enumerate any report values');
  assert.equal(fields[2].props.value,'saved');
  fields[1].props.onFocus();fields=selects(render());
  assert.deepEqual(calls,['c1']);
  fields[1].props.onChange({target:{value:'12'}});
  assert.deepEqual(updates,[['c1','12']]);
  calls=[];fields[2].props.onPointerDown();fields=selects(render());
  assert.deepEqual(calls,['c2']);
  props.open=false;calls=[];render();assert.deepEqual(calls,[]);
});
