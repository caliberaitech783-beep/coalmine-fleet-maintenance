export async function accountsResponse(response){
 const text=await response.text();let body;
 try{body=JSON.parse(text);}catch{
  if(response.status===401)throw new Error('Your session has expired. Please sign in again.');
  throw new Error('The Accounts service is temporarily unavailable or timed out. Please retry.');
 }
 if(!response.ok)throw new Error(body?.error||'Could not load the Accounts report. Please retry.');
 if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('The Accounts response was incomplete. Please retry.');
 return body;
}
function wait(ms,signal){return new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(new DOMException('Aborted','AbortError'));return;}
 const abort=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
 const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});
});}
export async function fetchAccountsReport(url,options,{fetcher=fetch,pause=wait,attempts=80}={}){
 for(let n=0;n<attempts;n++){
  const body=await accountsResponse(await fetcher(url,options));
  if(body.pending!==true)return body;
  await pause(1500,options.signal);
 }
 throw new Error('The ageing report is taking longer than expected. Please retry shortly.');
}
