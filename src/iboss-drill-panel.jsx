import React,{useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,X,ExternalLink,RefreshCw,CornerUpLeft} from 'lucide-react';
import {MERGE_CHAINS} from '../iboss-report-merge.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import DateInput from './date-input.mjs';
import './iboss-report-merge.css';

const money=value=>value===''||value===null||value===undefined||!Number.isFinite(Number(value))?'':Number(value).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
export const showValue=(type,value)=>type==='date'?(value?formatDisplayDate(value):''):type==='amount'?money(value):Array.isArray(value)?value.join(', '):value??'';
const targetLabel=chain=>({'party-position':'party','bank-position':'bank','vehicle-cost':'vehicle',voucher:'voucher','bank-guarantee':'bank guarantee','fixed-deposit':'fixed deposit','loan-emi':'loan'}[chain]||'record');

// One drill-down target: {chain,key,focus:{step,docNo}}. Links inside open further targets with Back.
export default function DrillPanel({target,range:initialRange,token,close}){
 const [stack,setStack]=useState([target]);
 const [range,setRange]=useState(initialRange),[draft,setDraft]=useState(initialRange),[rangeError,setRangeError]=useState('');
 const current=stack[stack.length-1],chain=MERGE_CHAINS[current.chain];
 const focusIndex=Math.max(0,chain.steps.findIndex(step=>step.key===current.focus?.step));
 const [direction,setDirection]=useState('');
 const [data,setData]=useState({steps:[],loading:true,error:''});
 const panel=useRef(null);
 useEffect(()=>{setDirection(focusIndex>0?'backward':'forward');},[current,focusIndex]);
 useEffect(()=>{
  const controller=new AbortController();setData({steps:[],loading:true,error:''});
  fetch(`/api/reports/iboss-accounts-merge/${current.chain}/trail?${new URLSearchParams({...range,key:current.key})}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
   .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load the document trail.');return body;})
   .then(body=>{if(!controller.signal.aborted)setData({...body,loading:false,error:''});})
   .catch(error=>{if(!controller.signal.aborted)setData({steps:[],loading:false,error:error.message});});
  return ()=>controller.abort();
 },[current,range,token]);
 useEffect(()=>{const onKey=event=>{if(event.key==='Escape')close();};window.addEventListener('keydown',onKey);return ()=>window.removeEventListener('keydown',onKey);},[close]);
 useEffect(()=>{if(!data.loading)panel.current?.querySelector('.merge-trail-steps li.focus')?.scrollIntoView?.({block:'nearest'});},[data.loading]);
 const open=next=>{setStack(list=>[...list,next]);panel.current?.scrollTo?.(0,0);};
 const applyRange=event=>{event.preventDefault();try{purchaseOrderRange(draft.from,draft.to);setRangeError('');setRange({...draft});}catch(error){setRangeError(error.message);}};
 const focusDoc=current.focus?.docNo;
 const steps=chain.keyed?data.steps:direction==='backward'?data.steps.slice(0,focusIndex+1).reverse():data.steps.slice(focusIndex);
 const shown=chain.keyed?steps.filter(step=>step.documents.length||step.key===current.focus?.step):steps;
 const empty=chain.keyed?steps.filter(step=>!step.documents.length&&step.key!==current.focus?.step).map(step=>step.title):[];
 const LinkButton=({link,children})=><button type="button" className="merge-doc-link" onClick={()=>open({chain:link.chain,key:link.key,focus:{step:MERGE_CHAINS[link.chain].steps[0].key,docNo:String(children)}})} title={`Open ${targetLabel(link.chain)} trail`}>{children}<ExternalLink aria-hidden="true"/></button>;
 return <div className="merge-trail-backdrop" onClick={close}>
  <aside ref={panel} className="merge-trail" role="dialog" aria-modal="true" aria-labelledby="merge-trail-title" onClick={event=>event.stopPropagation()}>
   <header>
    <div>
     {stack.length>1&&<button type="button" className="merge-trail-back" onClick={()=>setStack(list=>list.slice(0,-1))}><CornerUpLeft aria-hidden="true"/>Back to {targetLabel(stack[stack.length-2].chain)}</button>}
     <small>{chain.title}</small>
     <h2 id="merge-trail-title">{chain.keyed?`${targetLabel(current.chain)[0].toUpperCase()+targetLabel(current.chain).slice(1)} ${current.key}`:`Document trail · ${focusDoc||current.key}`}</h2>
    </div>
    <button type="button" className="merge-trail-close" onClick={close} aria-label="Close drill-down"><X/></button>
   </header>
   {chain.keyed?<form className="merge-trail-range" onSubmit={applyRange}>
    <label>From<DateInput value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label>
    <label>To<DateInput value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>
    <button type="submit"><RefreshCw aria-hidden="true"/>Apply</button>
    {rangeError&&<p role="alert">{rangeError}</p>}
   </form>:<div className="merge-trail-direction" role="group" aria-label="Trail direction">
    <button type="button" aria-pressed={direction==='backward'} onClick={()=>setDirection('backward')}><ArrowLeft/>Back to origin</button>
    <button type="button" aria-pressed={direction==='forward'} onClick={()=>setDirection('forward')}>Forward to completion<ArrowRight/></button>
   </div>}
   {data.loading?<p role="status">Tracing documents in Oracle…</p>:data.error?<p role="alert">{data.error}</p>:<>
    <p role="status">Total: {data.steps.reduce((sum,step)=>sum+step.documents.length,0).toLocaleString('en-IN')} records across {data.steps.length} linked reports.</p>
    <ol className="merge-trail-steps">
     {shown.map(step=><li key={step.key} className={`${step.documents.length?'done':'pending'}${step.key===current.focus?.step?' focus':''}`}>
      <span className="merge-trail-dot" aria-hidden="true"/>
      <div>
       <h3>{step.title}<small>{step.documents.length?`${step.documents.length} record${step.documents.length===1?'':'s'}`:'Not recorded'}</small></h3>
       {step.documents.map((document,index)=>{const hit=step.key===current.focus?.step&&document.docNo===focusDoc;
        return <details key={`${document.docNo}-${index}`} open={hit||step.documents.length===1}>
         <summary><b className={hit?'hit':''}>{document.docNo||'—'}</b>{document.docDate&&<span>{formatDisplayDate(document.docDate)}</span>}</summary>
         {document.link&&<p className="merge-trail-open"><LinkButton link={document.link}>{document.docNo}</LinkButton></p>}
         <dl>{document.details.map(item=><React.Fragment key={item.label}><dt>{item.label}</dt><dd>{item.link?<LinkButton link={item.link}>{showValue(item.type,item.value)}</LinkButton>:showValue(item.type,item.value)||'—'}</dd></React.Fragment>)}</dl>
        </details>;})}
      </div>
     </li>)}
    </ol>
    {empty.length>0&&<p className="merge-trail-empty">No records for this {targetLabel(current.chain)} in the selected period: {empty.join(', ')}.</p>}
   </>}
  </aside>
 </div>;
}
