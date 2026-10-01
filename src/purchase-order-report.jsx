import React, {useEffect, useMemo, useState} from 'react';
import {FileBarChart, RefreshCw} from 'lucide-react';
import DateInput from './date-input.mjs';
import {indiaDateTimeInputValue} from '../report-date-range.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import './stock-statement.css';
import './purchase-order-report.css';

export const purchaseOrderColumns = [
  {key:'documentStatus',label:'Doc Status',value:row=>row.documentStatus,render:row=><span className={`purchase-order-status${row.documentStatus.toLowerCase()==='active'?' active':''}`}>{row.documentStatus || 'Not recorded'}</span>},
  {key:'docType',label:'Doctype',value:row=>row.docType},
  {key:'orderDate',label:'Purchase Order Date',value:row=>formatDisplayDate(row.orderDate),sortValue:row=>row.orderDate},
  {key:'vendorName',label:'Vendor Name',value:row=>row.vendorName},
  {key:'orderNo',label:'Purchase Order No',value:row=>row.orderNo},
  {key:'deliveryDate',label:'Delivery Date',value:row=>formatDisplayDate(row.deliveryDate),sortValue:row=>row.deliveryDate},
  {key:'agentName',label:'Agent Name',value:row=>row.agentName},
  {key:'materialCode',label:'Material Code',value:row=>row.materialCode},
  {key:'itemName',label:'Item Name',value:row=>row.itemName},
  {key:'specification',label:'Specification Name',value:row=>row.specification},
];

export default function PurchaseOrderReport({token,ReportSection}) {
  const [range,setRange]=useState(()=>{const today=indiaDateTimeInputValue().slice(0,10);const year=Number(today.slice(0,4))-(Number(today.slice(5,7))<4?1:0);return {from:`${year}-04-01`,to:today};});
  const [draft,setDraft]=useState(range);
  const [attempt,setAttempt]=useState(0);
  const [data,setData]=useState({loading:true,rows:[],error:''});
  const [validation,setValidation]=useState('');
  const [status,setStatus]=useState('');
  const [type,setType]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setData({loading:true,rows:[],error:''});
    const query=new URLSearchParams(range);
    fetch(`/api/reports/purchase-order?${query}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load purchase orders.');return body;})
      .then(body=>{if(!controller.signal.aborted)setData({loading:false,rows:body.rows,error:'',checkedAt:body.checkedAt});})
      .catch(error=>{if(!controller.signal.aborted)setData({loading:false,rows:[],error:error.message});});
    return ()=>controller.abort();
  },[token,range,attempt]);
  const rows=useMemo(()=>data.rows.filter(row=>(!status||row.documentStatus===status)&&(!type||row.docType===type)),[data.rows,status,type]);
  const options=useMemo(()=>({status:[...new Set(data.rows.map(row=>row.documentStatus))].filter(Boolean).sort(),type:[...new Set(data.rows.map(row=>row.docType))].filter(Boolean).sort()}),[data.rows]);
  const load=event=>{event.preventDefault();try{purchaseOrderRange(draft.from,draft.to);setValidation('');setRange({...draft});setAttempt(value=>value+1);}catch(error){setValidation(error.message);}};
  return <section className="reports-workspace stock-statement purchase-order-report">
    <h1><FileBarChart aria-hidden="true"/> Purchase Order Register</h1>
    <p>View and search purchase orders. Each row shows one order item.</p>
    <form className="stock-statement-filters" onSubmit={load}>
      <label>From<DateInput value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label>
      <label>To<DateInput value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>
      <button type="submit" disabled={data.loading}><RefreshCw/> {data.loading?'Loading…':'Load / Refresh'}</button>
    </form>
    {validation&&<p role="alert">{validation}</p>}
    <div className="stock-statement-filters">
      <label>Document status<select value={status} onChange={event=>setStatus(event.target.value)}><option value="">All statuses</option>{options.status.map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Doctype<select value={type} onChange={event=>setType(event.target.value)}><option value="">All document types</option>{options.type.map(value=><option key={value}>{value}</option>)}</select></label>
    </div>
    {data.loading?<p role="status">Loading purchase orders from Oracle…</p>:data.error?<p role="alert">{data.error}</p>:<ReportSection title="Purchase Order Register" category="purchase-order" description={`${formatDisplayDate(range.from)} to ${formatDisplayDate(range.to)} · Checked ${new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}`} rows={rows} columns={purchaseOrderColumns} rowKey={row=>row.id} emptyMessage="No purchase orders match the selected filters."/>}
  </section>;
}
