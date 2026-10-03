import {createAccountPageLoader} from './iboss-account-loader.mjs';
import React,{useEffect,useMemo,useState,useRef} from 'react';
import {accountPrivileges} from '../account-role-access.mjs';
import {BookUser,Contact,Wallet,Landmark,Network,Settings,BookOpen,Percent,ArrowLeft,RefreshCw} from 'lucide-react';
import {ACCOUNT_VIEWS,ACCOUNT_SECTIONS} from '../iboss-accounts.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {indiaDateTimeInputValue} from '../report-date-range.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import DateInput from './date-input.mjs';
import './stock-statement.css';
import './iboss-accounts.css';
import IbossDashboard from './iboss-dashboard.jsx';
import IbossReportMerge from './iboss-report-merge.jsx';
import DrillPanel from './iboss-drill-panel.jsx';
import {accountDrill,ACCOUNT_DRILLS} from '../iboss-drill.mjs';
const SECTIONS=[['dashboard','Dashboard'],['masters','Masters'],['transactions','Transactions'],['merge','Report Merge']];
const icons=[BookUser,Contact,Wallet,Landmark,Settings,Network,BookOpen,Percent];
export default function IbossAccounts({token,ReportSection,initialSection='dashboard',permissions={}}) {
 const allowed=accountPrivileges(permissions);
 const visibleSections=SECTIONS.filter(([,label])=>allowed.includes(label));
 const accessKey=allowed.join('|');
 const [requestedSection,setSection]=useState(initialSection);
 const section=visibleSections.some(([key])=>key===requestedSection)?requestedSection:visibleSections[0]?.[0];
 const [view,setView]=useState('');
 const [range,setRange]=useState(()=>({from:indiaDateTimeInputValue(new Date(Date.now()-29*86400000)).slice(0,10),to:indiaDateTimeInputValue().slice(0,10)}));
 const [draft,setDraft]=useState(range),[attempt,setAttempt]=useState(0),[validation,setValidation]=useState('');
 const [data,setData]=useState({rows:[],loading:false,error:''});
 const pageLoader=useRef(null);
 const [drill,setDrill]=useState(null);
 const [mergeContext,setMergeContext]=useState(null);
 const dashboardOpen=(key,options={})=>{const target=key==='merge'?'merge':ACCOUNT_SECTIONS.masters.includes(key)?'masters':'transactions';if(!visibleSections.some(([section])=>section===target))return;if(options.range){setRange(options.range);setDraft(options.range);}if(key==='merge'&&options.anchor){setDrill({chain:options.chain,key:options.anchor,focus:{step:'party',docNo:options.label}});return;}if(key==='merge'){setMergeContext(options);setSection('merge');setView('');return;}setSection(target);open(key);};
 const definition=ACCOUNT_VIEWS[view];
 useEffect(()=>{setSection(initialSection);setView('');setDrill(null);setValidation('');},[initialSection,accessKey]);
 useEffect(()=>{
  if(!view)return;
  setData({rows:[],loading:true,error:''});
  const loader=createAccountPageLoader({url:`/api/reports/iboss-accounts/${view}?${new URLSearchParams(range)}`,token,onChange:setData});
  pageLoader.current=loader;void loader.loadMore();
  return ()=>{loader.dispose();if(pageLoader.current===loader)pageLoader.current=null;};
 },[token,view,range,attempt]);
 const columns=useMemo(()=>definition?.columns.map(column=>({...column,value:row=>(column.date||column.key.endsWith('_DATE'))&&row[column.key]?formatDisplayDate(row[column.key]):row[column.key]??'',sortValue:row=>row[column.key],...(ACCOUNT_DRILLS[view]?.[column.key]?{render:row=>{const target=accountDrill(view,column.key,row);const text=(column.date||column.key.endsWith('_DATE'))&&row[column.key]?formatDisplayDate(row[column.key]):row[column.key];if(!target)return text===''||text===null||text===undefined?'—':text;return <button type="button" className="merge-doc-link" title="Drill down" onClick={()=>setDrill(target)}>{text}</button>;}}:{})}))||[],[definition,view]);
 const open=key=>{
  if(key==='day-book'){const today=indiaDateTimeInputValue().slice(0,10);const currentDay={from:today,to:today};setRange(currentDay);setDraft(currentDay);}
  setData({rows:[],loading:true,error:''});setValidation('');setView(key);
 };
 const refresh=event=>{event.preventDefault();try{if(definition.dated)purchaseOrderRange(draft.from,draft.to);if(definition.asOf)purchaseOrderRange(draft.to,draft.to);setValidation('');setRange({...draft});setAttempt(value=>value+1);}catch(error){setValidation(error.message);}};
 const changeSection=(next,focus=false)=>{if(!visibleSections.some(([key])=>key===next))return;setSection(next);setView('');setValidation('');if(focus)queueMicrotask(()=>document.getElementById(`accounts-tab-${next}`)?.focus());};
 const sectionKeyDown=event=>{if(!visibleSections.length||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=visibleSections.findIndex(([key])=>key===section),last=visibleSections.length-1;changeSection(visibleSections[event.key==='Home'?0:event.key==='End'?last:event.key==='ArrowLeft'?(index+last)%visibleSections.length:(index+1)%visibleSections.length][0],true);};
 if(!visibleSections.length)return <section className="iboss-accounts"><h1>Accounts</h1><p>No Accounts privileges are assigned. Contact your administrator.</p></section>;
 return <section className="reports-workspace stock-statement iboss-accounts">
  <h1><Landmark aria-hidden="true"/> Accounts</h1>
  <div className="iboss-accounts-sections" role="tablist" aria-label="Accounts sections" onKeyDown={sectionKeyDown}>{visibleSections.map(([key,label])=><button key={key} type="button" role="tab" id={`accounts-tab-${key}`} tabIndex={section===key?0:-1} aria-selected={section===key} aria-controls={`accounts-panel-${key}`} onClick={()=>changeSection(key)}>{label}</button>)}</div>
  {section==='dashboard'?<div role="tabpanel" id="accounts-panel-dashboard" aria-labelledby="accounts-tab-dashboard"><IbossDashboard token={token} ReportSection={ReportSection} onOpen={dashboardOpen}/></div>:section==='merge'?<div role="tabpanel" id="accounts-panel-merge" aria-labelledby="accounts-tab-merge"><IbossReportMerge token={token} ReportSection={ReportSection} embedded initialChain={mergeContext?.chain||''} initialRange={mergeContext?.range}/></div>:<div className="iboss-accounts-panel" role="tabpanel" id={`accounts-panel-${section}`} aria-labelledby={`accounts-tab-${section}`}>
   <h2>{section==='transactions'?'Transactions':'Masters'}</h2>
   <div className="iboss-accounts-grid">{ACCOUNT_SECTIONS[section].map((key,index)=>{const entry=ACCOUNT_VIEWS[key],Icon=icons[index%icons.length];return <button type="button" key={key} aria-pressed={view===key} onClick={()=>open(key)}><span className={`iboss-account-icon tone-${index%icons.length}`}><Icon aria-hidden="true"/></span><span>{entry.title}</span></button>;})}</div>
  </div>}
  {SECTIONS.filter(([key])=>key!==section).map(([key])=><div key={key} hidden role="tabpanel" id={`accounts-panel-${key}`} aria-labelledby={`accounts-tab-${key}`}/>)}
  {definition&&<>
   <form className="stock-statement-filters" onSubmit={refresh}>
    <button type="button" onClick={()=>{setView('');setValidation('');}}><ArrowLeft/>All Accounts menus</button>
    {definition.dated&&<><label>From<DateInput value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label><label>To<DateInput value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label></>}
    {definition.asOf&&<label>Stored balances on / before<DateInput value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>}
    <button type="submit" disabled={data.loading}><RefreshCw/>{data.loading?'Loading…':'Refresh'}</button>
   </form>
   {validation&&<p role="alert">{validation}</p>}
   {data.loading?<p role="status">Loading {definition.title} from Oracle…</p>:data.error&&!data.rows.length?<p role="alert">{data.error}<button type="button" onClick={()=>pageLoader.current?.loadMore()}>Retry</button></p>:<>
    <p>{definition.note||'Current records from the connected Oracle database.'}</p>
    <p role="status">{data.hasMore?`${data.rows.length.toLocaleString('en-IN')} records loaded. More records are available.`:'All matching records loaded.'} Search, filters, sorting and Generate apply to the loaded records.</p>
    <ReportSection key={`${view}-${attempt}-${range.from}-${range.to}`} exportLabel={data.hasMore?"Generate (loaded rows)":"Generate"} title={definition.title} category="iboss-accounts" description={`${definition.asOf?`Stored on / before ${formatDisplayDate(range.to)} · `:definition.dated?`${formatDisplayDate(range.from)} to ${formatDisplayDate(range.to)} · `:''}${data.rows.length.toLocaleString('en-IN')} loaded records · Checked ${new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}`} rows={data.rows} columns={columns} rowKey={(row,index)=>`${row.ID}-${index}`} emptyMessage="No Oracle records match this report and date range."/>
    {data.error&&<p role="alert">{data.error}</p>}
    {data.hasMore&&<button type="button" className="secondary" disabled={data.loadingMore} onClick={()=>pageLoader.current?.loadMore()}>{data.loadingMore?'Loading more…':data.error?'Retry loading more':'Load 500 more records'}</button>}
   </>}
  </>}
  {drill&&<DrillPanel target={drill} range={definition?.dated||definition?.asOf?range:{from:indiaDateTimeInputValue(new Date(Date.now()-364*86400000)).slice(0,10),to:indiaDateTimeInputValue().slice(0,10)}} token={token} close={()=>setDrill(null)}/>}
 </section>;
}
