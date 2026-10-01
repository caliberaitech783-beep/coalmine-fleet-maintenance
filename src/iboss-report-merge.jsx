import React,{useEffect,useMemo,useState} from 'react';
import {Combine,RefreshCw,Lock,Link2,CheckSquare} from 'lucide-react';
import {MERGE_CHAINS,MAX_MERGE_STEPS,resolveSelection} from '../iboss-report-merge.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {indiaDateTimeInputValue} from '../report-date-range.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import DateInput from './date-input.mjs';
import './stock-statement.css';
import './iboss-accounts.css';
import './iboss-report-merge.css';
import DrillPanel,{showValue as show} from './iboss-drill-panel.jsx';

export default function IbossReportMerge({token,ReportSection,embedded=false}){
 const [chainKey,setChainKey]=useState('');
 const [picked,setPicked]=useState([]);
 const [range,setRange]=useState(()=>({from:indiaDateTimeInputValue(new Date(Date.now()-364*86400000)).slice(0,10),to:indiaDateTimeInputValue().slice(0,10)}));
 const [draft,setDraft]=useState(range),[validation,setValidation]=useState('');
 const [request,setRequest]=useState(null),[data,setData]=useState({rows:[],columns:[],loading:false,error:''});
 const [trail,setTrail]=useState(null);
 const chain=MERGE_CHAINS[chainKey];
 const selection=useMemo(()=>chain?resolveSelection(chainKey,picked):{steps:[],autoAdded:[]},[chain,chainKey,picked]);
 useEffect(()=>{
  if(!request)return;
  const controller=new AbortController();setData({rows:[],columns:[],loading:true,error:''});
  fetch(`/api/reports/iboss-accounts-merge/${request.chain}?${new URLSearchParams({...request.range,steps:request.steps.join(',')})}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
   .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not generate the merged report.');return body;})
   .then(body=>{if(!controller.signal.aborted)setData({...body,loading:false,error:''});})
   .catch(error=>{if(!controller.signal.aborted)setData({rows:[],columns:[],loading:false,error:error.message});});
  return ()=>controller.abort();
 },[token,request]);
 const choose=key=>{setChainKey(key);setPicked(MERGE_CHAINS[key].defaults);setRequest(null);setValidation('');};
 const toggle=step=>{
  if(step.key===chain.anchor)return;
  setValidation('');
  if(selection.steps.includes(step.key)){setPicked(picked.filter(key=>key!==step.key&&!(chain.steps.find(item=>item.key===key)?.requires||[]).includes(step.key)));return;}
  const next=[...picked,step.key];
  try{resolveSelection(chainKey,next);setPicked(next);}
  catch{setValidation(`Select at most ${MAX_MERGE_STEPS} reports in one merge. Untick a report first.`);}
 };
 const generate=event=>{
  event.preventDefault();
  try{purchaseOrderRange(draft.from,draft.to);setValidation('');setRange({...draft});setRequest({chain:chainKey,steps:selection.steps,range:{...draft},at:Date.now()});}
  catch(error){setValidation(error.message);}
 };
 const columns=useMemo(()=>(data.columns||[]).map(column=>({...column,
  value:row=>show(column.type,row[column.key]),sortValue:row=>Array.isArray(row[column.key])?row[column.key].length:row[column.key],
  render:column.link?row=>row[column.key]?<button type="button" className="merge-doc-link" onClick={()=>setTrail({chain:column.link,key:String(row[column.key]),focus:{step:MERGE_CHAINS[column.link].steps[0].key,docNo:String(row[column.key])}})}>{row[column.key]}</button>:'—'
   :column.type==='doc'?row=><button type="button" className="merge-doc-link" onClick={()=>setTrail({chain:request.chain,key:row.ANCHOR,focus:{step:column.step,docNo:row.DOC_NO}})}>{row.DOC_NO}</button>
   :column.type==='docs'?row=>(row[column.key]||[]).length?<span className="merge-doc-list">{row[column.key].map(docNo=><button type="button" key={docNo} className="merge-doc-link" onClick={()=>setTrail({chain:request.chain,key:row.ANCHOR,focus:{step:column.step,docNo}})}>{docNo}</button>)}</span>:<span className="merge-missing">Not recorded</span>
   :undefined})),[data.columns,request]);
 const ran=request&&MERGE_CHAINS[request.chain];
 const Wrapper=embedded?'div':'section';
 return <Wrapper className={embedded?'iboss-report-merge':'reports-workspace stock-statement iboss-accounts iboss-report-merge'}>
  {!embedded&&<h1><Combine aria-hidden="true"/> Accounts · Report Merge</h1>}
  <div className="iboss-accounts-panel" role="region" aria-labelledby="merge-process-heading">
   <h2 id="merge-process-heading">1. Choose a process</h2>
   <div className="merge-process-grid">{Object.entries(MERGE_CHAINS).filter(([,entry])=>!entry.drillOnly).map(([key,entry])=><button type="button" key={key} aria-pressed={chainKey===key} onClick={()=>choose(key)}><b>{entry.title}</b><span>{entry.description}</span><small>{entry.steps.length} linked reports</small></button>)}</div>
  </div>
  {chain&&<div className="iboss-accounts-panel" role="region" aria-labelledby="merge-steps-heading">
   <h2 id="merge-steps-heading">2. Select reports to merge <small>{selection.steps.length} / {MAX_MERGE_STEPS} selected</small></h2>
   <div className="merge-step-actions">
    <button type="button" onClick={()=>setPicked(chain.defaults)}><CheckSquare/>{chain.steps.length>MAX_MERGE_STEPS?`Recommended ${chain.defaults.length}`:'Full process'}</button>
    <button type="button" onClick={()=>setPicked([chain.anchor])}><Lock/>Required only</button>
   </div>
   <ol className="merge-step-flow">{chain.steps.map(step=>{const required=step.key===chain.anchor,auto=selection.autoAdded.includes(step.key)&&!required,on=selection.steps.includes(step.key);
    return <li key={step.key}><button type="button" aria-pressed={on} disabled={required} onClick={()=>toggle(step)} className={required?'required':auto?'auto':''}>
     <span className="merge-check" aria-hidden="true">{on?'✓':''}</span><span>{step.title}</span>
     {required&&<small><Lock aria-hidden="true"/>Required · main record</small>}{auto&&<small><Link2 aria-hidden="true"/>Auto-added for linking</small>}
    </button></li>;})}</ol>
   <form className="stock-statement-filters" onSubmit={generate}>
    <label>From<DateInput value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label>
    <label>To<DateInput value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>
    <span className="merge-date-hint">Filters on: {chain.dateLabel}</span>
    <button type="submit" disabled={data.loading}><RefreshCw/>{data.loading?'Generating…':'Generate merged report'}</button>
   </form>
   {validation&&<p role="alert">{validation}</p>}
  </div>}
  {ran&&(data.loading?<p role="status">Merging {request.steps.length} reports from Oracle…</p>:data.error?<p role="alert">{data.error}</p>:<>
   <p>Click any document number to trace it back to its origin or forward to completion. Shared columns appear once; child reports are summarised per {ran.rowLabel}.</p>
   <ReportSection key={`${request.chain}-${request.at}`} title={`${ran.title} · Merged`} category="iboss-accounts" description={`${formatDisplayDate(request.range.from)} to ${formatDisplayDate(request.range.to)} · ${request.steps.length} reports · ${(data.rows||[]).length.toLocaleString('en-IN')} rows${data.checkedAt?` · Checked ${new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}`:''}`} rows={data.rows||[]} columns={columns} rowKey={(row,index)=>`${row.ID}-${index}`} emptyMessage="No Oracle records match this process and date range."/>
  </>)}
  {trail&&ran&&<DrillPanel target={trail} range={request.range} token={token} close={()=>setTrail(null)}/>}
 </Wrapper>;
}
