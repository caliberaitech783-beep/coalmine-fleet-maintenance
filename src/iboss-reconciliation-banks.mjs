const fields=['UNRECONCILED_COUNT','RECONCILED_COUNT','UNCLEAR_DR','UNCLEAR_CR','RECONCILED_DR','RECONCILED_CR'];
// A bank may have separate summary rows for each company in the selected scope.
export function reconciliationBanks(rows,status='both',bank=''){
 const grouped=new Map();
 for(const row of rows){
  const code=String(row.ACCOUNT_CODE);
  if(!grouped.has(code))grouped.set(code,{code,name:row.ACCOUNT_NAME,...Object.fromEntries(fields.map(key=>[key,0]))});
  const entry=grouped.get(code);
  for(const key of fields)entry[key]+=Number(row[key]||0);
 }
 return [...grouped.values()].map(row=>({...row,state:row.UNRECONCILED_COUNT?(row.RECONCILED_COUNT?'Partly reconciled':'Not reconciled'):(row.RECONCILED_COUNT?'Fully reconciled':'No entries')}))
  .filter(row=>(!bank||row.code===String(bank))&&(status==='unreconciled'?row.UNRECONCILED_COUNT>0:status==='reconciled'?row.RECONCILED_COUNT>0:row.UNRECONCILED_COUNT+row.RECONCILED_COUNT>0))
  .sort((a,b)=>String(a.name).localeCompare(String(b.name),undefined,{numeric:true})||a.code.localeCompare(b.code));
}
