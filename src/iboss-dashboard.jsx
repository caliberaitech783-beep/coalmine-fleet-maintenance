import FinanceCharts from './iboss-finance-charts.jsx';
import AccountLedger from './iboss-account-ledger.jsx';
import {TRADE_AGE_BANDS} from '../trade-age-bands.mjs';
import ReconciliationControls from './iboss-bank-reconciliation.jsx';
import {recordCountLabel} from './iboss-record-count.mjs';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Landmark,Wallet,BookOpen,Clock,FileText,Shield,Users,ArrowUpRight,RefreshCw,ChevronRight,Calendar,AlertTriangle,Percent,Building2} from 'lucide-react';
import {ACCOUNT_VIEWS} from '../iboss-accounts.mjs';
import {purchaseOrderRange} from '../purchase-order-report.mjs';
import {dashboardFinancialYearRange,DASHBOARD_REFRESH_MS} from './iboss-dashboard-refresh.mjs';
import {mergeDashboardSection} from './iboss-dashboard-sections.mjs';
import {formatDisplayDate} from '../date-time-format.mjs';
import EditableDateInput,{typedDateRange} from './iboss-editable-date.mjs';
import DrillPanel from './iboss-drill-panel.jsx';
import {accountDrill} from '../iboss-drill.mjs';
import './iboss-dashboard.css';

export const dashboardAmount=value=>{if(value==null)return '—';const number=Number(value);if(!Number.isFinite(number))return '—';const sign=number<0?'−':'';const absolute=Math.abs(number);return sign+(absolute>=1e7?`${(absolute/1e7).toFixed(2)} Cr`:absolute>=1e5?`${(absolute/1e5).toFixed(2)} L`:absolute.toLocaleString('en-IN',{maximumFractionDigits:2}));};
const iconByKind={bank:Landmark,payable:Wallet,receivable:BookOpen,risk:AlertTriangle,loan:Building2,calendar:Calendar,advice:FileText};
const units={'trade-payable':'ledger accounts','trade-receivable':'ledger accounts','bank-reconciliation':'unreconciled entries',bank:'accounts',loan:'loans','overdue-emi':'instalments','upcoming-emi':'instalments','pending-advice':'advice records'};
const linkedReports=[['payment-advice','Payment Advice'],['emi-schedule','EMI Schedule'],['payable-receivable','Party Balances'],['bank-balance','Bank Balances'],['fixed-deposit','Fixed Deposits'],['bank-guarantee','Bank Guarantees']];
const metricViews={'trade-payable':'trade-payable','trade-receivable':'trade-receivable','bank-reconciliation':'bank-reconciliation',bank:'bank-balance',payable:'payable-receivable',receivable:'payable-receivable','aged-receivable':'outstanding-180',loan:'emi-details','overdue-emi':'emi-schedule','upcoming-emi':'emi-schedule','pending-advice':'payment-advice','maturing-fd':'fixed-deposit','expiring-bg':'bank-guarantee','expired-bg':'bank-guarantee'};

function MetricDetails({metric,range,token,ReportSection,preview,close,reconciliation=[]}){
 const [bank,setBank]=useState(''),[status,setStatus]=useState('unreconciled');
 const [searchDraft,setSearchDraft]=useState(''),[search,setSearch]=useState('');
 const [ageing,setAgeing]=useState('ledger');
 const [ledger,setLedger]=useState(null);
 const requestRange=useMemo(()=>({...range,search,...(metric.key.startsWith('trade-')?{ageing}:{}),...(metric.key==='bank-reconciliation'?{bank,status}:{})}),[range,search,ageing,bank,status,metric.key]);
 const [count,setCount]=useState({totalCount:null});
 useEffect(()=>{
  if(preview)return;const controller=new AbortController();setCount({totalCount:null,countLoading:true});
  fetch(`/api/reports/iboss-accounts-dashboard/${metric.key}/count?${new URLSearchParams(requestRange)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
   .then(async response=>{const body=await response.json();if(!response.ok||!Number.isSafeInteger(body.totalCount)||body.totalCount<0)throw new Error();return body;})
   .then(body=>{if(!controller.signal.aborted)setCount(body);})
   .catch(()=>{if(!controller.signal.aborted)setCount({totalCount:null,countError:'Total count unavailable — reopen to retry.'});});
  return ()=>controller.abort();
 },[metric,requestRange,token,preview]);
 const dialog=useRef(null),[page,setPage]=useState(0),[detail,setDetail]=useState(null),[data,setData]=useState({loading:true,rows:[]});
 useEffect(()=>{const opener=document.activeElement;dialog.current.showModal();return ()=>{if(opener?.isConnected)opener.focus();};},[]);
 useEffect(()=>{
  if(preview){const view=metricViews[metric.key];setData({view,columns:ACCOUNT_VIEWS[view].columns,rows:preview.metricRows?.[metric.key]||[],loading:false,...range});return;}
  const controller=new AbortController();setData({loading:true,rows:[]});
  fetch(`/api/reports/iboss-accounts-dashboard/${metric.key}?${new URLSearchParams({...requestRange,page})}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal})
   .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load card details.');return body;})
   .then(body=>{if(!controller.signal.aborted)setData({...body,loading:false});})
   .catch(error=>{if(!controller.signal.aborted)setData({loading:false,rows:[],error:error.message});});
  return ()=>controller.abort();
 },[metric,requestRange,token,page,preview]);
 useEffect(()=>{const timer=setTimeout(()=>{setPage(0);setSearch(searchDraft.trim());},400);return ()=>clearTimeout(timer);},[searchDraft]);
 const columns=useMemo(()=>(data.columns||[]).map(column=>{
  const value=row=>column.date||column.key.endsWith('_DATE')?row[column.key]?formatDisplayDate(row[column.key]):'':row[column.key]??'';
  return {...column,value,sortValue:row=>row[column.key],drilldown:true,render:row=>value(row)===''?'—':<button type="button" className="iboss-detail-link" onClick={()=>{if(!preview&&metric.key.startsWith('trade-')&&['ACCOUNT_NAME','ACCOUNT_CODE'].includes(column.key)){setLedger({account:String(row.ACCOUNT_CODE),company:String(row.COMPANYCODE||range.company||'')});return;}const target=accountDrill(data.view,column.key,row)||ACCOUNT_VIEWS[data.view].columns.map(item=>accountDrill(data.view,item.key,row)).find(Boolean);if(preview||target)setDetail({target,row,from:data.from,to:data.to,label:String(value(row))});}}>{value(row)}</button>};
 }),[data,metric.key,range.company,preview]);
 return <dialog ref={dialog} className="iboss-dash-dialog" aria-labelledby="dashboard-card-title" onCancel={event=>{event.preventDefault();if(detail)setDetail(null);else close();}}>
  <header><div><small>{preview?'Illustrative preview records':'Oracle records behind this card'}</small><h2 id="dashboard-card-title">{metric.title}</h2></div><button type="button" onClick={close} aria-label="Close dashboard details">×</button></header>
  {['bank-reconciliation','trade-payable','trade-receivable'].includes(metric.key)&&<p>Voucher period: {formatDisplayDate(range.from)} to {formatDisplayDate(range.to)} · {range.companyName||range.company||'All companies'}</p>}
  {metric.key==='bank-reconciliation'&&<ReconciliationControls rows={reconciliation} bank={bank} status={status} onBank={value=>{setPage(0);setBank(value);}} onStatus={value=>{setPage(0);setStatus(value);}}/>}
  {metric.key.startsWith('trade-')&&ageing==='ledger'&&<p>ERP trade-group ledgers and their child accounts. Opening + period credits − period debits = closing. Closing credit is positive; closing debit is negative. Click an account to view its vouchers.</p>}
  {metric.key.startsWith('trade-')&&<div className="iboss-dash-controls"><label>Ageing / report view<select value={ageing} onChange={event=>{setPage(0);setAgeing(event.target.value);}}><option value="ledger">Ledger balances</option>{TRADE_AGE_BANDS.map(band=><option key={band.value} value={band.value}>{band.label}</option>)}</select></label></div>}
  {metric.key.startsWith('trade-')&&ageing!=='ledger'&&<><p>Ageing is measured from the bill/document date to {formatDisplayDate(range.to)}; voucher date is used where the bill date is missing. Includes older opening items regardless of Activity from. Advances and opposite balances remain visible. This is document age, not days overdue.</p><p className="iboss-dash-note">Settlement uses current ERP allocation links with both vouchers dated through the selected closing date. Later edits to allocation links cannot be reconstructed.</p>{count.totalDr!=null&&<p>All matching entries: Dr {Number(count.totalDr).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})} · Cr {Number(count.totalCr).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})} · Net {Math.abs(count.signedTotal).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})} {count.signedTotal<0?'Dr':'Cr'}</p>}</>}
  <div className="iboss-dash-controls"><label>Search all matching Oracle records<input type="search" maxLength={120} value={searchDraft} onChange={event=>setSearchDraft(event.target.value)} placeholder="Account code, account / party name, bill or voucher…"/></label><button type="button" onClick={()=>{setSearchDraft('');setSearch('');setPage(0);}}>Clear search</button></div>
  {data.loading?<p role="status">Loading matching records…</p>:data.error?<p role="alert">{data.error}</p>:<>
   <p role="status">{recordCountLabel({...count,rows:data.rows,...(preview?{totalCount:data.rows.length}:{})})}</p>
   <ReportSection key={data.view} showSearch={false} title={metric.title} rows={data.rows} columns={columns} rowKey={(row,index)=>`${row.ID}-${index}`} category="iboss-accounts" emptyMessage="No records match this card." description={preview?'Example records for layout review.':'Search covers all matching Oracle records. Export includes loaded records only. Click an account or party for its ledger details.'}/>
   {!preview&&<nav aria-label="Dashboard detail pages"><button type="button" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Previous</button><span>Page {page+1} · up to 200 records</span><button type="button" disabled={!data.hasMore} onClick={()=>setPage(value=>value+1)}>Next</button></nav>}
  </>}
  {detail&&(preview?<section className="iboss-dash-example"><h3>Example record · {detail.label}</h3><p>Live records open their linked Oracle document trail, including recorded audit details where available.</p><dl>{Object.entries(detail.row).map(([key,value])=><React.Fragment key={key}><dt>{key.replace(/_/g,' ')}</dt><dd>{String(value??'—')}</dd></React.Fragment>)}</dl><button type="button" onClick={()=>setDetail(null)}>Back to records</button></section>:<DrillPanel target={detail.target} range={{...range,from:detail.from,to:detail.to}} token={token} close={()=>setDetail(null)}/>)}
 {ledger&&<AccountLedger {...ledger} range={range} token={token} close={()=>setLedger(null)}/>}
 </dialog>;
}

export default function IbossDashboard({token,ReportSection,onOpen:openReport,preview=null}){
 const [mode,setMode]=useState('management');
 const [range,setRange]=useState(()=>preview?{from:preview.from,to:preview.to}:dashboardFinancialYearRange());
 const onOpen=(key,options={})=>openReport(key,{range,...options});
 const [companies,setCompanies]=useState([]);
 const [draft,setDraft]=useState(range),[attempt,setAttempt]=useState(0),[validation,setValidation]=useState(''),[selected,setSelected]=useState(null);
 const [data,setData]=useState(preview?{...preview,loading:false}:{loading:true});
 useEffect(()=>{
  if(preview||data.loading||data.refreshing)return;
  const timer=setInterval(()=>setAttempt(value=>value+1),DASHBOARD_REFRESH_MS);
  return ()=>clearInterval(timer);
 },[preview,data.loading,data.refreshing,attempt]);
 useEffect(()=>{
  if(preview)return;
  const controller=new AbortController();
  setData(old=>old.cards&&old.from===range.from&&old.to===range.to&&(old.company||'')===(range.company||'')?{...old,refreshing:true,error:null}:{loading:true,refreshing:true});
  const load=async section=>{
   const response=await fetch(`/api/reports/iboss-accounts-dashboard?${new URLSearchParams({...range,section})}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
   const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load the Accounts dashboard.');return body;
  };
  (async()=>{
   try{
    const core=await load('core');if(controller.signal.aborted)return;setCompanies(core.companies||[]);
    setData(old=>({...mergeDashboardSection(old,core,'core'),refreshing:true}));
    await Promise.all(['receivable','tax'].map(async section=>{
     try{const body=await load(section);if(!controller.signal.aborted)setData(old=>mergeDashboardSection(old,body,section));}
     catch(error){if(!controller.signal.aborted)setData(old=>({...old,sectionPending:{...old.sectionPending,[section]:false},sectionErrors:{...old.sectionErrors,[section]:error.message}}));}
    }));
   }catch(error){if(!controller.signal.aborted)setData(old=>({...old,loading:false,error:error.message}));}
   finally{if(!controller.signal.aborted)setData(old=>({...old,refreshing:false}));}
  })();
  return ()=>controller.abort();
 },[token,range,attempt,preview]);
 const refresh=event=>{event.preventDefault();try{const selected={...typedDateRange(draft),company:draft.company||'',companyName:companies.find(item=>item.COMPANYCODE===draft.company)?.COMPANYNAME||''};purchaseOrderRange(selected.from,selected.to);setValidation('');setDraft(selected);setRange(selected);setAttempt(value=>value+1);}catch(error){setValidation(error.message);}};
 const select=(key,title)=>setSelected({key,title:title||data.cards.find(card=>card.key===key)?.title||data.tasks.find(task=>task.key===key)?.title});
 const maxAge=Math.max(1,...(data.aging||[]).flatMap(item=>[Math.abs(item.payable),Math.abs(item.receivable)]));
 const taskCount=(data.tasks||[]).filter(task=>task.count>0).length;
 const renderParties=side=><section className="iboss-dash-panel"><div className="iboss-dash-panel-heading"><div><small>Current signed balances</small><h3>{side==='receivable'?'Largest customer balances':'Largest vendor balances'}</h3></div><button type="button" onClick={()=>select(side)}>View all <ChevronRight/></button></div><table className="iboss-dash-party-table"><thead><tr><th>Party</th><th>Bills</th><th>Balance</th></tr></thead><tbody>{data.parties[side].length?data.parties[side].map(party=><tr key={party.code}><td><button type="button" onClick={()=>onOpen('merge',{range,chain:'party-position',anchor:party.code,label:party.name})}>{party.name}<small>{party.code}</small></button></td><td>{party.bills.toLocaleString('en-IN')}</td><td>{dashboardAmount(party.balance)}</td></tr>):<tr><td colSpan="3">{side==='receivable'&&(data.sectionPending?.receivable||data.sectionErrors?.receivable)?'Customer balances loading or unavailable—see status above.':'No open balances.'}</td></tr>}</tbody></table></section>;
 return <div className="iboss-dashboard">
  {preview&&<div className="iboss-dash-preview"><Shield/> DESIGN PREVIEW · Illustrative figures for review · Not deployed</div>}
  <div className="iboss-dash-title"><div><small>IBOSS / ACCOUNTS</small><h2>Finance at a glance</h2><p>Balances, commitments and follow-up — one place to start your day.</p></div><div className="iboss-dash-mode" role="group" aria-label="Dashboard focus"><button type="button" aria-pressed={mode==='management'} onClick={()=>setMode('management')}>Management</button><button type="button" aria-pressed={mode==='accounts'} onClick={()=>setMode('accounts')}>Accounts team</button></div></div>
  <form className="iboss-dash-controls" onSubmit={refresh}><label>Activity from<EditableDateInput label="Activity from" value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})}/></label><label>To / planning date<EditableDateInput label="To / planning date" value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})}/></label><label>Company<select aria-label="Company" value={draft.company||''} onChange={event=>setDraft({...draft,company:event.target.value})}><option value="">All companies</option>{companies.map(company=><option key={company.COMPANYCODE} value={company.COMPANYCODE}>{company.COMPANYNAME}</option>)}</select></label><button type="submit" ><RefreshCw/>{preview?'Apply preview dates':'Apply filters / Refresh'}</button><span><i className="iboss-dash-status"/>{preview?'Example data':data.checkedAt?`Checked ${new Date(data.checkedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'})}`:'Connecting to Oracle'}</span></form>
  {validation&&<p role="alert">{validation}</p>}
  {!preview&&<p className="iboss-dash-note">Automatically refreshes from Oracle every 10 minutes while this dashboard is open. Your selected dates and company are retained.</p>}
  {data.cards&&data.error&&<p role="alert">Refresh failed: {data.error}. Showing the last successful figures.</p>}
  {Object.entries(data.sectionPending||{}).filter(([,pending])=>pending).map(([section])=><p role="status" key={section}>Updating {section==='receivable'?'receivables':'tax totals'} from Oracle… Previously loaded figures remain visible; missing figures show —.</p>)}
  {Object.entries(data.sectionErrors||{}).map(([section,error])=><p role="alert" key={section}>{section==='receivable'?'Receivables':'Tax totals'} could not refresh: {error}. Previously loaded figures may be out of date. Use Refresh to retry.</p>)}
  {data.loading?<div className="iboss-dash-loading" role="status">Loading balances, commitments and source reports from Oracle…</div>:data.error&&!data.cards?<div className="iboss-dash-loading" role="alert">{data.error}<button type="button" onClick={()=>setAttempt(value=>value+1)}>Retry</button></div>:<>
   <div className="iboss-dash-scope"><span>{companies.find(company=>company.COMPANYCODE===range.company)?.COMPANYNAME||'All companies'} · Current balances + activity from {formatDisplayDate(range.from)} to {formatDisplayDate(range.to)}</span><span>Amounts in ERP reporting units · L = lakh · Cr = crore</span></div>
   <FinanceCharts data={data} formatAmount={dashboardAmount} onSelect={select} onAdvice={()=>onOpen('payment-advice')}/>
   <div className="iboss-kpi-section-heading"><h3>Financial overview</h3><span>Select a card to explore its records <ArrowUpRight aria-hidden="true"/></span></div>
   <div className="iboss-dash-kpis">{data.cards.map(card=>{const Icon=iconByKind[card.kind]||Wallet;return <button type="button" className={`iboss-dash-kpi ${card.kind}`} key={card.key} onClick={()=>select(card.key)} aria-label={`Open ${card.title} records`}><span className="iboss-dash-kpi-top"><span>{card.title}</span><span className="iboss-kpi-icon"><Icon aria-hidden="true"/></span></span><strong>{dashboardAmount(card.amount)}{card.balanceSide&&<span className="iboss-kpi-side">{card.balanceSide} balance</span>}</strong><span className="iboss-dash-kpi-count">{card.count?.toLocaleString('en-IN')} {units[card.key]||'bills'}<span className="iboss-kpi-open"><ArrowUpRight aria-hidden="true"/></span></span><small>{card.note}</small></button>;})}</div>
   <div className={`iboss-dash-main ${mode}`}>
    <section className="iboss-dash-panel iboss-dash-aging"><div className="iboss-dash-panel-heading"><div><small>Current balances · age of bill</small><h3>Where money is waiting</h3></div><span className="iboss-dash-legend"><i className="payable"/>Payables <i className="receivable"/>Receivables</span></div><p>Bill age, not days past due. Signed credit balances remain visible.</p><div className="iboss-dash-aging-grid">{data.aging.map(item=><div key={item.band}><span>{item.band} days</span><div className="iboss-dash-age-pair">{['payable','receivable'].map(side=><button type="button" key={side} onClick={()=>select(side)} aria-label={`Open ${side} report; ${item.band} day bill-age total ${dashboardAmount(item[side])}`}><span className="iboss-dash-track"><i className={side} style={{width:`${Math.abs(item[side])/maxAge*100}%`}}/></span><b>{dashboardAmount(item[side])}</b></button>)}</div></div>)}</div></section>
    <section className="iboss-dash-panel iboss-dash-actions"><div className="iboss-dash-panel-heading"><div><small>Accounts worklist</small><h3>Needs attention <span>{taskCount}</span></h3></div><Clock/></div><p>Open a task to see the records behind it.</p><div>{data.tasks.map(task=><button type="button" key={task.key} onClick={()=>select(task.key,task.title)} className={!task.count?'clear':''}><span className={`iboss-dash-task-icon ${task.tone}`}>{task.tone==='urgent'?<AlertTriangle/>:<Calendar/>}</span><span><b>{task.title}</b><small>{task.count?.toLocaleString('en-IN')} records · {dashboardAmount(task.amount)}</small></span><ChevronRight/></button>)}</div></section>
   </div>
   <div className="iboss-dash-party-grid">{renderParties('receivable')}{renderParties('payable')}</div>
   <div className="iboss-dash-bottom-grid">
    <section className="iboss-dash-panel"><div className="iboss-dash-panel-heading"><div><small>Ledger closing through To date</small><h3>Bank position</h3></div><Landmark/></div><div className="iboss-dash-bank-list">{data.bank.length?data.bank.map((row,index)=><button type="button" key={index} onClick={()=>select('bank')}><span>{row.ACCOUNT_NAME}<small>{row.COMPANYCODE} · closing {formatDisplayDate(row.SNAPSHOT_DATE)}</small></span><b>{dashboardAmount(row.BALANCEAMOUNT)}</b></button>):<p>No bank ledger entries through this date.</p>}</div><button className="iboss-dash-text-button" type="button" onClick={()=>onOpen('merge',{range,chain:'bank-position'})}>Open Bank Position merge <ArrowUpRight/></button></section>
    <section className="iboss-dash-panel"><div className="iboss-dash-panel-heading"><div><small>Activity in selected period</small><h3>Advice & tax overview</h3></div><Percent/></div><div className="iboss-dash-tax">{data.advice.map(row=><button type="button" key={row.STATE} onClick={()=>onOpen('payment-advice')}><span>{row.STATE} advice<small>{row.RECORDS} records · completion flag</small></span><b>{dashboardAmount(row.AMOUNT)}</b></button>)}{data.tax.map(row=><button type="button" key={row.TAX} onClick={()=>onOpen(row.TAX==='TDS'?'tds-payable':'party-tcs')}><span>Recorded {row.TAX}<small>Recorded amount · not tax payable</small></span><b>{dashboardAmount(row.AMOUNT)}</b></button>)}</div></section>
    <section className="iboss-dash-panel"><div className="iboss-dash-panel-heading"><div><small>Shared ERP directory · company-filtered assets and cost centres</small><h3>Your finance directory</h3></div><Users/></div><div className="iboss-dash-masters">{[['ACCOUNTS','Accounts','account-master'],['VENDORS','Vendors','vendor-master'],['COST_CENTRES','Cost centres','cost-centre'],['WORK_CENTRES','Work centres','work-centre'],['ASSETS','Assets','asset-register']].map(([key,label,view])=><button type="button" key={key} onClick={()=>onOpen(view)}><span>{label}</span><b>{Number(data.masters[key]||0).toLocaleString('en-IN')}</b><ChevronRight/></button>)}</div></section>
   </div>
   <section className="iboss-dash-report-links"><div><h3>Go straight to the source</h3><p>Masters, transactions and merged reports stay one click away.</p></div><div>{linkedReports.map(([key,label])=><button type="button" key={key} onClick={()=>onOpen(key)}>{label}<ArrowUpRight/></button>)}<button type="button" onClick={()=>onOpen('merge')}>Report Merge<ArrowUpRight/></button></div></section>
   <p className="iboss-dash-note">{data.note}</p>
  </>}
  {selected&&<MetricDetails key={selected.key} metric={selected} reconciliation={data.reconciliation||[]} range={range} token={token} ReportSection={ReportSection} preview={preview} close={()=>setSelected(null)}/>}
 </div>;
}
