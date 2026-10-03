import React, {createContext, useContext, useEffect, useMemo, useState} from 'react';
import {requestShiftLabel} from '../request-shift.mjs';
import {tableElements, tableModel} from './table-actions-model.mjs';

const Context = createContext({shifts:[],requests:new Map(),loading:true});
export const useRequestShiftData = () => useContext(Context);
export function RequestShiftProvider({token,requests=[],children}) {
  const [data,setData]=useState({shifts:[],loading:true});
  useEffect(()=>{
    const controller=new AbortController();
    setData({shifts:[],loading:true});
    fetch('/api/request-shifts',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error('Shift Master unavailable');return response.json();})
      .then(shifts=>setData({shifts,loading:false}))
      .catch(()=>{if(!controller.signal.aborted)setData({shifts:[],loading:false});});
    return ()=>controller.abort();
  },[token]);
  const value=useMemo(()=>({...data,requests:new Map(requests.map(row=>[row.ref,row]))}),[data,requests]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

// Add a real cell to request tables, so filtering, print and exports share the same value.
function requestReference(node) {
  if(Array.isArray(node))return node.map(requestReference).find(Boolean);
  if(!React.isValidElement(node))return '';
  return node.props.reference || requestReference(node.props.children);
}
export function withRequestShiftCells(children, data) {
  const {sections,columns}=tableModel(children);
  if(columns.some(column=>column.label==='Shift'))return children;
  const reference=columns.find(column=>/^job ref(?:erence)?(?: no\.?)?$/i.test(column.label));
  const started=columns.find(column=>/^(started|production date and time)$/i.test(column.label));
  if(!reference && !(started && columns.some(column=>/door/i.test(column.label))))return children;
  const site=columns.find(column=>/^(request site|site|current location)$/i.test(column.label));
  return sections.map(section=> !['thead','tbody','tfoot'].includes(section.type)?section:React.cloneElement(section,{},tableElements(section.props.children).map(row=>{
    const cells=tableElements(row.props.children);
    if(cells.length===1 && cells[0].props.colSpan>1)return React.cloneElement(row,{},React.cloneElement(cells[0],{colSpan:cells[0].props.colSpan+1}));
    const rawStart=row.props['data-request-start'] || started?.sortValue(row);
    const referenceText=row.props['data-request-reference'] || requestReference(row) || reference?.value(row) || '';
    const referenceKey=String(referenceText).match(/REQ-[\w-]+/)?.[0] || referenceText;
    const record=data.requests.get(referenceKey) || {start:typeof rawStart==='number'?new Date(rawStart):rawStart,site:row.props['data-request-site'] || site?.value(row)};
    const value=data.loading?'Loading shift…':requestShiftLabel(record,data.shifts);
    return React.cloneElement(row,{},section.type==='thead'?<th key="requestShift" sortKey="requestShift">Shift</th>:<td key="requestShift">{value}</td>,cells);
  })));
}
