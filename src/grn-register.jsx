import React, {useEffect, useMemo, useState} from 'react';
import {FileBarChart, RefreshCw} from 'lucide-react';
import DateInput from './date-input.mjs';
import {indiaDateTimeInputValue} from '../report-date-range.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import './stock-statement.css';
import './purchase-order-report.css';

export const grnColumns = [
  {key:'serialNo',label:'Serial No',value:row=>row.serialNo},
  {key:'documentStatus',label:'Doc Status',value:row=>row.documentStatus,render:row=><span className={`purchase-order-status${row.documentStatus.toLowerCase()==='active'?' active':''}`}>{row.documentStatus || 'Not recorded'}</span>},
  {key:'department',label:'Department',value:row=>row.department},
  {key:'docType',label:'Doctype',value:row=>row.docType},
  {key:'vendorName',label:'Vendor Name',value:row=>row.vendorName},
  {key:'grnDate',label:'GRN Date',value:row=>formatDisplayDate(row.grnDate),sortValue:row=>row.grnDate},
  {key:'grnNo',label:'GRN No',value:row=>row.grnNo},
  {key:'materialInNo',label:'Material In No',value:row=>row.materialInNo},
  {key:'weighmentNo',label:'Weighment No',value:row=>row.weighmentNo},
  {key:'reference',label:'Reference',value:row=>row.reference},
];
export default function GrnRegister({token,ReportSection}) {
  const [range,setRange]=useState(()=>({from:indiaDateTimeInputValue(new Date(Date.now()-29*86400000)).slice(0,10),to:indiaDateTimeInputValue().slice(0,10)}));
  const [draft,setDraft]=useState(range);
  const [attempt,setAttempt]=useState(0);
  const [data,setData]=useState({loading:true,rows:[],error:''});
  const [validation,setValidation]=useState('');
  const [status,setStatus]=useState('');
  const [type,setType]=useState('');
  const [department,setDepartment]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setData({loading:true,rows:[],error:''});
    const query=new URLSearchParams(range);
    fetch(`/api/reports/grn-register?${query}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load goods receipt notes.');return body;})
      .then(body=>{if(!controller.signal.aborted)setData({loading:false,rows:body.rows,error:'',checkedAt:body.checkedAt});})
      .catch(error=>{if(!controller.signal.aborted)setData({loading:false,rows:[],error:error.message});});
    return ()=>controller.abort();
  },[token,range,attempt]);
  const rows=useMemo(()=>data.rows.filter(row=>(!status||row.documentStatus===status)&&(!type||row.docType===type)&&(!department||row.department===department)),[data.rows,status,type,department]);
  const options=useMemo(()=>({status:[...new Set(data.rows.map(row=>row.documentStatus))].filter(Boolean).sort(),type:[...new Set(data.rows.map(row=>row.docType))].filter(Boolean).sort(),department:[...new Set(data.rows.map(row=>row.department))].filter(Boolean).sort()}),[data.rows]);
  const load=event=>{event.preventDefault();try{purchaseOrderRange(draft.from,draft.to);setValidation('');setRange({...draft});setAttempt(value=>value+1);}catch(error){setValidation(error.message);}};
  return <section className="reports-workspace stock-statement purchase-order-report">
    <h1><FileBarChart aria-hidden="true"/> GRN Register</h1>
    <p>View and search goods receipt notes. Each row shows one receipt item.</p>
    <form className="stock-statement-filters" onSubmit={load}>
      <label>From<DateInput value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label>
      <label>To<DateInput value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>
      <button type="submit" disabled={data.loading}><RefreshCw/> {data.loading?'Loading…':'Load / Refresh'}</button>
    </form>
    {validation&&<p role="alert">{validation}</p>}
    <div className="stock-statement-filters">
      <label>Document status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">All statuses</option>{options.status.map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Doctype<select value={type} onChange={event=>setType(event.target.value)}><option value="">All document types</option>{options.type.map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Department<select value={department} onChange={event=>setDepartment(event.target.value)}><option value="">All departments</option>{options.department.map(value=><option key={value}>{value}</option>)}</select></label>
    </div>
    {data.loading?<p role="status">Loading goods receipt notes from Oracle…</p>:data.error?<p role="alert">{data.error}</p>:<ReportSection title="GRN Register" category="grn-register" description={`${formatDisplayDate(range.from)} to ${formatDisplayDate(range.to)} · Checked ${new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}`} rows={rows} columns={grnColumns} rowKey={row=>row.id} emptyMessage="No goods receipt notes match the selected filters."/>}
  </section>;
}

