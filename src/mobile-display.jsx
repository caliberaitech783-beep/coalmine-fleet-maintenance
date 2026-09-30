import React, {createContext, useContext, useLayoutEffect, useState, useEffect} from 'react';
import {simpleMobileDisplay} from './mobile-performance.mjs';
import './mobile-display.css';

const MobileDisplayContext=createContext(false);
export const useSimpleMobile=()=>useContext(MobileDisplayContext);
export function MobileDisplayProvider({session, mobile, children}){
  const simple=simpleMobileDisplay(session,mobile);
  useLayoutEffect(()=>{
    document.documentElement.dataset.simpleMobile=String(simple);
    return ()=>{delete document.documentElement.dataset.simpleMobile;};
  },[simple]);
  return <MobileDisplayContext.Provider value={simple}>{children}</MobileDisplayContext.Provider>;
}

export function SimpleDataTable({title,columns=[],rows=[]}){
  const [limit,setLimit]=useState(25);
  useEffect(()=>setLimit(25),[rows]);
  return <section className="simple-data-section"><h3>{title}</h3><div className="simple-data-scroll"><table><thead><tr>{columns.map((column,index)=><th key={index} scope="col">{column.label}</th>)}</tr></thead><tbody>{rows.slice(0,limit).map((row,index)=><tr key={index}>{columns.map((column,columnIndex)=><td key={columnIndex}>{typeof column.value==='function'?column.value(row):row[column.key]??'—'}</td>)}</tr>)}</tbody></table></div>{rows.length>limit&&<button type="button" onClick={()=>setLimit(value=>value+25)}>Show next {Math.min(25,rows.length-limit)} rows</button>}{!rows.length&&<p>No records for the selected filters.</p>}</section>;
}
