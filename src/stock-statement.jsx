import React, {useEffect, useMemo, useState} from 'react';
import {FileBarChart, RefreshCw} from 'lucide-react';
import './stock-statement.css';

const columns = [
  ['serialNo','Serial No'], ['location','Location'], ['itemGroup','Item Group'],
  ['itemCode','Item Code'], ['itemName','Item Name'], ['specification','Specification'],
  ['description','Description'], ['dealsIn','Deals In'], ['itemCategory','Item Category'],
].map(([key,label]) => ({key,label,value:row=>row[key]}));

export default function StockStatement({token, ReportSection}) {
  const [attempt,setAttempt]=useState(0);
  const [data,setData]=useState({loading:true,rows:[],error:''});
  const [location,setLocation]=useState('');
  const [group,setGroup]=useState('');
  useEffect(()=>{
    const controller=new AbortController();
    setData({loading:true,rows:[],error:''});
    fetch('/api/reports/stock-statement',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load stock statement.');return body;})
      .then(body=>{if(!controller.signal.aborted)setData({loading:false,rows:body.rows,error:'',checkedAt:body.checkedAt});})
      .catch(error=>{if(!controller.signal.aborted)setData({loading:false,rows:[],error:error.message});});
    return ()=>controller.abort();
  },[token,attempt]);
  const rows=useMemo(()=>data.rows.filter(row=>(!location||row.location===location)&&(!group||row.itemGroup===group)),[data.rows,location,group]);
  return <section className="reports-workspace stock-statement">
    <h1><FileBarChart aria-hidden="true"/> Stock Statement</h1>
    <p>View and search stock items by location.</p>
    <div className="stock-statement-filters">
      <label>Location<select value={location} onChange={event=>setLocation(event.target.value)}><option value="">All locations</option>{[...new Set(data.rows.map(row=>row.location))].sort().map(value=><option key={value}>{value}</option>)}</select></label>
      <label>Item group<select value={group} onChange={event=>setGroup(event.target.value)}><option value="">All item groups</option>{[...new Set(data.rows.map(row=>row.itemGroup))].filter(Boolean).sort().map(value=><option key={value}>{value}</option>)}</select></label>
      <button type="button" disabled={data.loading} onClick={()=>setAttempt(value=>value+1)}><RefreshCw/> Refresh</button>
    </div>
    {data.loading?<p role="status">Loading stock from Oracle…</p>:data.error?<p role="alert">{data.error}</p>:<ReportSection title="Stock Statement" category="stock-statement" description={`Inventory items by location. Checked ${new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}.`} rows={rows} columns={columns} rowKey={row=>row.serialNo} emptyMessage="No stock matches the selected filters."/>}
  </section>;
}
