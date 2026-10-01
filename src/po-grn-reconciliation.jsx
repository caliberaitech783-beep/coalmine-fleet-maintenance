import React,{useEffect,useMemo,useState} from 'react';
import {FileBarChart,RefreshCw} from 'lucide-react';
import DateInput from './date-input.mjs';
import {indiaDateTimeInputValue} from '../report-date-range.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {reconciliationMatches} from '../po-grn-reconciliation.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import './stock-statement.css';
import './po-grn-reconciliation.css';

const column=(key,label)=>({key,label,value:row=>row[key]});
const dateColumn=(key,label)=>({key,label,value:row=>row[key]?formatDisplayDate(row[key]):'',sortValue:row=>row[key]});
const itemColumns=[column('vendor','Vendor'),column('poNo','PO No'),dateColumn('poDate','PO Date'),column('poStatus','Current PO Status'),column('itemCode','Item Code'),column('itemName','Item Name'),column('specification','Specification'),column('unit','Unit'),column('ordered','Ordered Qty'),column('received','GRN Received Qty'),column('accepted','Accepted Qty'),column('rejected','Rejected Qty'),column('pending','Pending Receipt Qty'),column('overReceived','Over Received Qty'),dateColumn('dueDate','Delivery Due'),dateColumn('lastReceipt','Last GRN Date'),column('overdueDays','Overdue Days'),column('lateReceiptDays','Last Receipt Delay Days'),column('grnCount','GRN Count'),column('grnNos','GRN Nos'),column('fulfilment','Receipt Status'),column('flags','Attention')];
const receiptColumns=[column('grnNo','GRN No'),dateColumn('grnDate','GRN Date'),column('poNo','PO No'),column('vendor','GRN Vendor'),column('itemCode','Item Code'),column('itemName','Item Name'),column('specification','Specification'),column('unit','Unit'),column('received','Received Qty'),column('accepted','Accepted Qty'),column('rejected','Rejected Qty'),column('status','Current GRN Status'),column('match','PO Match'),{key:'vendorMismatch',label:'Vendor Mismatch',value:row=>row.vendorMismatch?'Yes':'—'}];
const vendorColumns=[column('vendor','Vendor'),column('orders','PO Count'),column('items','PO Items'),column('pendingItems','Pending Items'),column('overdueItems','Overdue Items'),column('maxOverdueDays','Longest Overdue Days'),column('rejectedItems','Items With Rejection'),column('overReceivedItems','Over Received Items'),column('vendorMismatchItems','Vendor Mismatch Items')];
const filters=[['all','All PO items'],['pending','Pending receipt'],['overdue','Overdue'],['no-receipt','No GRN yet'],['rejected','Rejected quantity'],['over-received','Over received'],['vendor-mismatch','Vendor mismatch'],['complete','Fully received']];

export default function PoGrnReconciliation({token,ReportSection}) {
 const [range,setRange]=useState(()=>({from:indiaDateTimeInputValue(new Date(Date.now()-29*86400000)).slice(0,10),to:indiaDateTimeInputValue().slice(0,10)}));
 const [draft,setDraft]=useState(range),[attempt,setAttempt]=useState(0),[validation,setValidation]=useState('');
 const [data,setData]=useState({loading:true,error:'',rows:[],receipts:[],unmatched:[],vendors:[],summary:{}});
 const [tab,setTab]=useState('items'),[filter,setFilter]=useState('all'),[vendor,setVendor]=useState('');
 useEffect(()=>{
  const controller=new AbortController();setData({loading:true,error:'',rows:[],receipts:[],unmatched:[],vendors:[],summary:{}});
  fetch(`/api/reports/po-grn-reconciliation?${new URLSearchParams(range)}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'})
   .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not merge PO and GRN records.');return body;})
   .then(body=>{if(!controller.signal.aborted)setData({...body,loading:false,error:''});})
   .catch(error=>{if(!controller.signal.aborted)setData({loading:false,error:error.message,rows:[],receipts:[],unmatched:[],vendors:[],summary:{}});});
  return ()=>controller.abort();
 },[token,range,attempt]);
 const itemRows=useMemo(()=>data.rows.filter(row=>(!vendor||row.vendor===vendor)&&reconciliationMatches(row,filter)),[data.rows,vendor,filter]);
 const receiptRows=useMemo(()=>data.receipts.filter(row=>!vendor||row.vendor===vendor),[data.receipts,vendor]);
 const unmatchedRows=useMemo(()=>data.unmatched.filter(row=>!vendor||row.vendor===vendor),[data.unmatched,vendor]);
 const vendors=useMemo(()=>[...new Set([...data.rows,...data.receipts].map(row=>row.vendor))].filter(Boolean).sort(),[data.rows,data.receipts]);
 const load=event=>{event.preventDefault();try{purchaseOrderRange(draft.from,draft.to);setValidation('');setRange({...draft});setAttempt(value=>value+1);}catch(error){setValidation(error.message);}};
 const choose=(nextFilter,nextTab='items')=>{setVendor('');setFilter(nextFilter);setTab(nextTab);};
 const cards=[['orders','Purchase orders','all'],['pendingItems','Pending PO items','pending'],['overdueItems','Overdue PO items','overdue'],['noReceiptItems','PO items with no GRN','no-receipt'],['rejectedItems','Items with rejection','rejected'],['unmatchedLines','Unlinked GRN lines','all','unmatched']];
 const view=tab==='vendors'?{title:'Vendor Follow-up',rows:data.vendors.filter(row=>!vendor||row.vendor===vendor),columns:vendorColumns}:tab==='unmatched'?{title:'Unlinked GRNs',rows:unmatchedRows,columns:receiptColumns}:tab==='receipts'?{title:'GRN Detail',rows:receiptRows,columns:receiptColumns}:{title:'PO Fulfilment',rows:itemRows,columns:itemColumns};
 return <section className="reports-workspace stock-statement po-grn-reconciliation">
  <h1><FileBarChart aria-hidden="true"/> PO-GRN Reconciliation</h1>
  <p>Compare purchase orders with goods received and identify supplier follow-up.</p>
  <form className="stock-statement-filters" onSubmit={load}>
   <label>PO date from<DateInput value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label>
   <label>PO date to / receipts through<DateInput value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label>
   <button disabled={data.loading} type="submit"><RefreshCw/>{data.loading?'Loading…':'Merge / Refresh'}</button>
  </form>
  {validation&&<p role="alert">{validation}</p>}
  {data.loading?<p role="status">Merging Oracle PO and GRN records…</p>:data.error?<p role="alert">{data.error}</p>:<>
   <div className="po-grn-summary">{cards.map(([key,label,nextFilter,nextTab])=><button key={key} type="button" onClick={()=>choose(nextFilter,nextTab)}><strong>{Number(data.summary[key]||0).toLocaleString('en-IN')}</strong><span>{label}</span></button>)}</div>
   <p className="po-grn-explanation">One row per PO item and specification. Receipts include all non-cancelled GRNs through {formatDisplayDate(range.to)} for POs created within the selected dates. Statuses are current. Pending receipt quantity = ordered minus recorded received quantity, with a minimum of zero. Accepted and rejected quantities are shown separately; quantities are compared within each unit.</p>
   <div className="po-grn-tabs" role="group" aria-label="Merged report view">{[['items','PO Fulfilment'],['receipts','GRN Detail'],['unmatched','Unlinked GRNs'],['vendors','Vendor Follow-up']].map(([key,label])=><button key={key} type="button" aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</div>
   <div className="stock-statement-filters">
    <label>Vendor<select value={vendor} onChange={event=>setVendor(event.target.value)}><option value="">All vendors</option>{vendors.map(value=><option key={value}>{value}</option>)}</select></label>
    {tab==='items'&&<label>Focus<select value={filter} onChange={event=>setFilter(event.target.value)}>{filters.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}
   </div>
   {tab==='unmatched'&&<p>Within the receipt period, {data.summary.withoutPoLines} lines have no PO reference and {data.summary.brokenPoLines} reference a PO item/specification that could not be found. Non-PO receipts may be legitimate; review the match reason before following up.</p>}
   {tab==='receipts'&&<p>{data.summary.outsideCohortLines} receipt lines link to POs outside the selected PO dates. They appear here and are excluded from PO fulfilment totals.</p>}
   <ReportSection key={tab} title={`PO-GRN · ${view.title}`} category="po-grn-reconciliation" description={`${formatDisplayDate(range.from)} to ${formatDisplayDate(range.to)} · Checked ${new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}`} rows={view.rows} columns={view.columns} rowKey={row=>row.id} rowClassName={row=>row.overdueDays>0?'po-grn-overdue':row.rejected>0?'po-grn-rejected':''} emptyMessage="No records match the selected report and filters."/>
   <small>{data.summary.cancelledLines} cancelled GRN lines excluded. Summary cards cover all vendors in the loaded period; click a card to see its records.</small>
  </>}
 </section>;
}
