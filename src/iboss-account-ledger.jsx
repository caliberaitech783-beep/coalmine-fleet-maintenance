import React,{useEffect,useRef,useState} from 'react';
import DrillPanel from './iboss-drill-panel.jsx';
import DateInput from './date-input.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import './iboss-account-ledger.css';
const money=v=>Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const balance=v=>`${money(Math.abs(Number(v||0)))} ${Number(v)<0?'Dr':'Cr'}`;
export default function AccountLedger({account,company,range:initialRange,token,close}){
 const dialog=useRef(null),[range,setRange]=useState(initialRange),[draft,setDraft]=useState(initialRange),[page,setPage]=useState(0),[data,setData]=useState({loading:true}),[error,setError]=useState(''),[voucher,setVoucher]=useState(null);
 useEffect(()=>{const opener=document.activeElement;dialog.current.showModal();return ()=>{if(opener?.isConnected)opener.focus();};},[]);
 useEffect(()=>{const controller=new AbortController();setData({loading:true});fetch(`/api/reports/iboss-account-ledger?${new URLSearchParams({account,company,from:range.from,to:range.to,page})}`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error('Could not load the Oracle ledger. Please retry.');return r.json();}).then(body=>setData(body)).catch(e=>{if(!controller.signal.aborted)setData({error:e.message});});return ()=>controller.abort();},[account,company,range,page,token]);
 const totals=(data.balances||[]).reduce((s,r)=>{for(const k of Object.keys(s))s[k]+=Number(r[k]||0);return s;},{OPENING_BALANCE:0,DEBITAMOUNT:0,CREDITAMOUNT:0,BALANCEAMOUNT:0});
 return <dialog ref={dialog} className="account-ledger-dialog" onCancel={e=>{e.preventDefault();e.stopPropagation();if(voucher)setVoucher(null);else close();}} aria-labelledby="account-ledger-title">
 <header><div><small>ERP Account Ledger · Read only</small><h2 id="account-ledger-title">{data.account?.PARTYNAME||account}</h2><p>Account: {account} · {data.account?.PARTYTYPENAME||'Account'} · Company: {company||'All companies'}</p></div><button onClick={close} aria-label="Close account ledger">×</button></header>
 <form onSubmit={e=>{e.preventDefault();try{purchaseOrderRange(draft.from,draft.to);setError('');setPage(0);setRange({...draft});}catch(e){setError(e.message);}}}><label>From<DateInput value={draft.from} onChange={e=>setDraft({...draft,from:e.target.value})}/></label><label>To<DateInput value={draft.to} onChange={e=>setDraft({...draft,to:e.target.value})}/></label><button>Apply / Refresh</button></form>
 {error&&<p role="alert">{error}</p>}
 {data.loading?<p role="status">Loading ledger and audit details from Oracle…</p>:data.error?<p role="alert">{data.error}</p>:<>
 <p>Account created by: {data.account?.CREATOR_NAME||data.account?.CREATOR||'Not recorded'} {data.account?.CREATOR_NAME&&data.account?.CREATOR?`(${data.account.CREATOR})`:''} · Created: {data.account?.CREATED_AT||'Not recorded'}</p>
 <div className="account-ledger-totals"><span>Opening / B/F<strong>{balance(totals.OPENING_BALANCE)}</strong></span><span>Period debit<strong>{money(totals.DEBITAMOUNT)}</strong></span><span>Period credit<strong>{money(totals.CREDITAMOUNT)}</strong></span><span>Closing<strong>{balance(totals.BALANCEAMOUNT)}</strong></span></div>
 <p>Total: {Number(data.totalCount||0).toLocaleString('en-IN')} entries · {data.rows.length} loaded. Totals cover the full period. Click a voucher for its complete transaction details.</p>
 <div className="account-ledger-table"><table><thead><tr>{['Date','Location','Counterpart account(s)','Voucher / Party bill','Narration','Debit','Credit','Running balance','Created by','Created date / time (ERP)'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{data.rows.map(r=><tr key={`${r.TNO}:${r.SNO}`}><td>{formatDisplayDate(r.VOUCHER_DATE)}</td><td>{r.LOCATIONNAME||'—'}</td><td>{r.COUNTERPART_ACCOUNTS||'—'}</td><td><button className="iboss-detail-link" onClick={()=>setVoucher({chain:'voucher',key:String(r.TNO),focus:{step:'voucher',docNo:r.VOUCHERNO}})}>{r.VOUCHERNO}</button><div>{r.BILLNO}</div></td><td>{r.NARRATION||'—'}</td><td>{Number(r.AMOUNT)<0?money(-Number(r.AMOUNT)):'—'}</td><td>{Number(r.AMOUNT)>0?money(r.AMOUNT):'—'}</td><td>{balance(r.RUNNING_BALANCE)}</td><td>{r.CREATOR_NAME||r.CREATOR||'Not recorded'}{r.CREATOR_NAME&&r.CREATOR&&<small>{r.CREATOR}</small>}</td><td>{r.CREATED_AT||'Not recorded'}</td></tr>)}</tbody></table></div>
 {!data.rows.length&&<p>No transactions in this period.</p>}<nav><button disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1}</span><button disabled={!data.hasMore} onClick={()=>setPage(p=>p+1)}>Next</button></nav>
 </>}{voucher&&<DrillPanel target={voucher} range={{...range,company}} token={token} close={()=>setVoucher(null)}/>}</dialog>;
}
