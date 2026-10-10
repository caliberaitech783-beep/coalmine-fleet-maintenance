// Keep slow Oracle aggregation off the HTTP request lifetime. Identical table/count
// requests share one snapshot; search and paging never re-run the aggregation.
export function ageingSnapshots({ttl=600000,maxEntries=12,now=Date.now}={}){
 const entries=new Map();
 return (key,load)=>{
  let entry=entries.get(key);
  if(entry&&entry.state!=='pending'&&now()-entry.at>=(entry.state==='error'?5000:ttl)){entries.delete(key);entry=null;}
  if(!entry){
   if(entries.size>=maxEntries){const victim=[...entries].find(([,value])=>value.state!=='pending');if(victim)entries.delete(victim[0]);else throw new Error('Ageing reports are busy. Please retry shortly.');}
   entry={state:'pending',at:now()};entries.set(key,entry);
   Promise.resolve().then(load).then(rows=>Object.assign(entry,{state:'ready',rows,at:now()}),error=>Object.assign(entry,{state:'error',error,at:now()}));
  }
  if(entry.state==='error')throw entry.error;
  return entry.state==='ready'?entry.rows:null;
 };
}
export function ageingSummaryResult(rows,request,input,{count=false,pageSize=200}={}){
 const band=input.ageing.slice('summary:'.length);
 const ageKey=band==='older'?'AGE_OVER_360':band==='future'?'AGE_FUTURE':band==='unknown'?'AGE_UNKNOWN':'AGE_'+band;
 const search=String(input.search||'').trim().toLowerCase();
 const filtered=rows.filter(row=>(band==='all'||Number(row[ageKey]||0)!==0)&&(!search||request.columns.some(c=>String(row[c.key]??'').toLowerCase().includes(search))));
 if(count)return filtered.reduce((r,row)=>({totalCount:r.totalCount+1,totalDr:r.totalDr+Number(row.OUTSTANDING_DR||0),totalCr:r.totalCr+Number(row.OUTSTANDING_CR||0),signedTotal:r.signedTotal+Number(row.BALANCEAMOUNT||0)}),{totalCount:0,totalDr:0,totalCr:0,signedTotal:0});
 const start=request.page*pageSize;
 return {view:request.view,columns:request.columns,from:request.from,to:request.to,page:request.page,rows:filtered.slice(start,start+pageSize).map(row=>({...row,ID:String(row.COMPANYCODE)+':'+String(row.ACCOUNT_CODE)})),hasMore:start+pageSize<filtered.length};
}
