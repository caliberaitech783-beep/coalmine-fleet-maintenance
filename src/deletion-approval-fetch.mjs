// Replay only an explicit pre-execution 428 response after human approval.
// The dialog is injected so transport/session behavior can be tested without a browser.
let approvalBarrier=null;
export async function fetchWithDeletionApproval(performFetch,input,init,approve=async()=>false) {
  // Pause this browser's background polling/writes while a human reviews a
  // snapshot. The OTP calls and final execution use performFetch directly.
  while(approvalBarrier)await approvalBarrier.promise;
  const method=String(init?.method || input?.method || 'GET').toUpperCase();
  if(['GET','HEAD','OPTIONS'].includes(method))return performFetch(input,init);
  const original=typeof Request!=='undefined'&&input instanceof Request?input.clone():input;
  const response=await performFetch(input,init);
  if(response.status!==428)return response;
  const body=await response.clone().json().catch(()=>null),preview=body?.deletionApproval;
  if(!preview)return response;
  const url=new URL(typeof input==='string'?input:input.url,window.location.origin);
  if(url.origin!==window.location.origin || !url.pathname.startsWith('/api/'))return response;
  const headers=new Headers(init?.headers || original?.headers);
  let initialReason=headers.get('X-Audit-Reason') || '';
  try{initialReason ||= JSON.parse(init?.body || '{}').reason || '';}catch{}
  const signal=init?.signal || original?.signal;
  const request=async(action,payload)=>{
    const authHeaders=new Headers(headers);authHeaders.set('Content-Type','application/json');
    authHeaders.delete('Content-Length');authHeaders.delete('X-Deletion-Approval');
    const result=await performFetch(`/api/deletion-approvals/${encodeURIComponent(preview.id)}/${action}`,{method:'POST',headers:authHeaders,body:JSON.stringify(payload),signal,cache:'no-store'});
    const data=await result.json().catch(()=>({}));
    if(!result.ok)throw new Error(data.error || 'WhatsApp verification failed. No deletion was authorized.');
    return data;
  };
  let release;const barrier={promise:new Promise(resolve=>{release=resolve;})};approvalBarrier=barrier;
  try {
    const approved=await approve({preview,request,initialReason,signal});
    if(!approved || signal?.aborted)return new Response(JSON.stringify({error:'Deletion cancelled. No records were deleted.'}),{status:409,headers:{'Content-Type':'application/json'}});
    headers.set('X-Deletion-Approval',preview.id);
    return await performFetch(original,{...init,headers});
  }finally{if(approvalBarrier===barrier)approvalBarrier=null;release();}
}
