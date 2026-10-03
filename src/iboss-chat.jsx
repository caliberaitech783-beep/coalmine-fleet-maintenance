import React,{useEffect,useRef,useState} from 'react';
import {ACCOUNT_VIEWS} from '../iboss-accounts.mjs';
import {indiaDateTimeInputValue} from '../report-date-range.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import {chatOptions,filterChatOptions,matchChatQuestion} from './iboss-chat-options.mjs';
import {createAccountPageLoader} from './iboss-account-loader.mjs';
import DateInput from './date-input.mjs';

export default function IbossChat({token,allowed,ReportSection}){
 const options=chatOptions(allowed),today=indiaDateTimeInputValue().slice(0,10);
 const [question,setQuestion]=useState(''),[range,setRange]=useState({from:today,to:today});
 const [request,setRequest]=useState(null),[error,setError]=useState('');
 const [data,setData]=useState({rows:[],loading:false});const loader=useRef(null);
 const definition=request&&ACCOUNT_VIEWS[request.view];
 useEffect(()=>{
  if(!request)return;
  const active=createAccountPageLoader({url:`/api/reports/iboss-accounts/${request.view}?${new URLSearchParams(request.range)}`,token,onChange:setData});
  loader.current=active;void active.loadMore();
  return ()=>{active.dispose();loader.current=null;};
 },[request,token]);
 const ask=option=>{
  try{
   const selected=/^Today's /.test(option.prompt)?{from:today,to:today}:range;
   purchaseOrderRange(selected.from,selected.to);setRange(selected);setQuestion(option.prompt);setError('');
   setData({rows:[],loading:true});setRequest({view:option.view,prompt:option.prompt,range:{...selected}});
  }catch(e){setError(e.message);}
 };
 const submit=event=>{event.preventDefault();const option=matchChatQuestion(question,options);if(option)ask(option);else setError('Choose one of the suggested reports below. Custom questions and additional conditions are not interpreted yet.');};
 const filtered=filterChatOptions(question,options);
 return <div className="iboss-chat">
  <h2>Accounts Chat Bot</h2>
  <p>Choose a question or search for an Accounts report. Answers use your connected ERP records.</p>
  <form onSubmit={submit} className="stock-statement-filters">
   <label className="iboss-chat-question">What would you like to check?<input value={question} onChange={event=>setQuestion(event.target.value)} placeholder="Try: today's bank closing" maxLength={200}/></label>
   <label>From<DateInput value={range.from} onChange={event=>setRange({...range,from:event.target.value})}/></label>
   <label>To / balance date<DateInput value={range.to} onChange={event=>setRange({...range,to:event.target.value})}/></label>
   <button type="submit">Ask</button><button type="button" className="secondary" onClick={()=>{setQuestion('');setError('');}}>Show all suggestions</button>
  </form>
  <p>Questions starting with “Today's” use today in India. Other reports use the selected dates where supported.</p>
  {error&&<p role="alert">{error}</p>}
  <div className="iboss-chat-suggestions" aria-label="Suggested Accounts questions">{(filtered.length?filtered:options).map(option=><button type="button" className="secondary" key={option.view} onClick={()=>ask(option)}>{option.prompt}</button>)}</div>
  {request&&<section className="iboss-chat-answer" aria-label="ERP answer" aria-busy={!!data.loading}>
   <h3>{request.prompt}</h3>
   {data.loading?<p role="status">Fetching ERP records…</p>:<>
    <p>{definition.note||'Records from the connected Oracle database.'}</p>
    {definition.asOf&&<p><strong>Latest stored balances on or before {formatDisplayDate(request.range.to)}.</strong> Check each Stored Balance Date; an earlier snapshot is not confirmed closing for the selected day.</p>}
    {data.error&&<p role="alert">{data.error} <button type="button" onClick={()=>loader.current?.loadMore()}>Retry</button></p>}
    {!data.error||data.rows.length>0?<>
     <p role="status">{data.rows.length} records loaded{data.hasMore?' · more available':''}. Search and exports cover loaded rows only. Fetched {new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST.</p>
     <ReportSection key={`${request.view}-${request.range.from}-${request.range.to}`} title={definition.title} description={`${formatDisplayDate(request.range.from)} to ${formatDisplayDate(request.range.to)}`} category="iboss-accounts" rows={data.rows} columns={definition.columns.map(column=>({...column,value:row=>row[column.key]??''}))} exportLabel={data.hasMore?'Generate (loaded rows)':'Generate'} emptyMessage="No ERP records match this report and date range."/>
     {data.hasMore&&<button type="button" disabled={data.loadingMore} onClick={()=>loader.current?.loadMore()}>{data.loadingMore?'Loading…':'Load 500 more records'}</button>}
    </>:null}
   </>}
  </section>}
 </div>;
}
