import React from 'react';
const amount=value=>Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const balance=value=>`${amount(Math.abs(value))} ${value<0?'Dr':'Cr'}`;
export default function ReconciliationControls({rows,bank,status,onBank,onStatus}){
 const banks=[...new Map(rows.map(row=>[row.ACCOUNT_CODE,row.ACCOUNT_NAME])).entries()];
 const selected=rows.filter(row=>!bank||row.ACCOUNT_CODE===bank);
 const sum=key=>selected.reduce((total,row)=>total+Number(row[key]||0),0);
 const dr=(status==='reconciled'?0:sum('UNCLEAR_DR'))+(status==='unreconciled'?0:sum('RECONCILED_DR'));
 const cr=(status==='reconciled'?0:sum('UNCLEAR_CR'))+(status==='unreconciled'?0:sum('RECONCILED_CR'));
 return <section aria-label="Bank reconciliation filters and balances">
  <div className="iboss-dash-controls">
   <label>Bank account<select value={bank} onChange={event=>onBank(event.target.value)}><option value="">All banks</option>{banks.map(([code,name])=><option key={code} value={code}>{name} ({code})</option>)}</select></label>
   <label>ERP reconciliation status<select value={status} onChange={event=>onStatus(event.target.value)}><option value="unreconciled">Not reconciled</option><option value="reconciled">Reconciled</option><option value="both">Both</option></select></label>
  </div>
  <p>Dates follow the selected voucher-date range. “Reconcile Date (voucher date)” is a display value; actual ERP reconciliation date and status remain separate.</p>
  {selected.length?<table className="iboss-dash-party-table"><thead><tr><th>Balance / totals</th><th>Dr</th><th>Cr</th></tr></thead><tbody>
   <tr><th>Selected entries — full filtered total</th><td>{amount(dr)}</td><td>{amount(cr)}</td></tr>
   <tr><th>Unclear / not reconciled in period</th><td>{amount(sum('UNCLEAR_DR'))}</td><td>{amount(sum('UNCLEAR_CR'))}</td></tr>
   <tr><th>Book balance through To date</th><td colSpan="2">{balance(sum('BALANCEAMOUNT'))}</td></tr>
   <tr><th>Calculated pass-book balance</th><td colSpan="2">{balance(sum('PASSBOOK_BALANCE'))}</td></tr>
  </tbody></table>:<p>No bank ledger balances match this selection.</p>}
  <p className="iboss-dash-note">ERP calculation: book balance + unclear debits − unclear credits. This does not confirm a bank-statement match or mark vouchers reconciled.</p>
 </section>;
}
