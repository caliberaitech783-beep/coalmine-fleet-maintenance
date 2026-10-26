import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {fetchWithDeletionApproval as approvalFetch} from './deletion-approval-fetch.mjs';
import './deletion-approval.css';

function ApprovalDialog({preview,request,initialReason,onComplete,signal}) {
  const [reason,setReason]=useState(initialReason || '');
  const [confirmation,setConfirmation]=useState('');
  const [otp,setOtp]=useState('');
  const [sent,setSent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const dialog=useRef(null);
  useEffect(()=>{
    const before=document.activeElement;
    dialog.current?.focus();
    const abort=()=>onComplete(false);
    signal?.addEventListener('abort',abort,{once:true});
    return ()=>{signal?.removeEventListener('abort',abort);before?.focus?.();};
  },[]);
  const act=async event=>{
    event.preventDefault();if(busy || signal?.aborted)return;
    setBusy(true);setError('');
    try {
      if(!sent) {
        await request('send',{reason:reason.trim(),confirmation:'Approve deletion of the listed items'});
        setSent(true);
      }else {
        await request('verify',{otp});
        onComplete(true);
      }
    }catch(failure){setError(failure.message || 'Verification failed. Deletion is blocked.');}
    finally{setBusy(false);}
  };
  const expected='Approve deletion of the listed items';
  return <div className="deletion-approval-backdrop"><section className="deletion-approval-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="deletion-approval-title" onKeyDown={event=>{
    if(event.key==='Escape'&&!busy)onComplete(false);
    if(event.key==='Tab'){
      const controls=dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)');
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }}>
    <h2 id="deletion-approval-title">Approval required: Delete items</h2>
    <p><strong>{preview.items.length} affected records.</strong> Review the exact items below before authorizing deletion.</p>
    <div className="deletion-approval-items"><table><thead><tr><th>Location</th><th>Record ID</th><th>Name / reference</th></tr></thead><tbody>{preview.items.map((item,index)=><tr key={`${item.table}:${item.id}:${index}`}><td>{item.table}</td><td>{item.id}</td><td>{item.label || '—'}</td></tr>)}</tbody></table></div>
    <p><strong>Impact:</strong> {preview.impact}</p><p><strong>Recovery:</strong> {preview.recovery}</p>
    <p>The WhatsApp code goes only to <strong>{preview.phone}</strong>. It expires after 10 minutes and permits one execution of this selection.</p>
    {!preview.deliveryConfigured&&<p role="alert" className="deletion-approval-error">Deletion is blocked until the Fast2SMS WhatsApp sender and approved authentication template are configured.</p>}
    <form onSubmit={act}>
      <label>Reason for deletion<textarea required maxLength={500} value={reason} disabled={busy||sent} onChange={event=>setReason(event.target.value)}/></label>
      {!sent?<label>Type “{expected}” to confirm this exact selection<input required autoComplete="off" value={confirmation} disabled={busy} onChange={event=>setConfirmation(event.target.value)}/></label>:
        <label>WhatsApp verification code<input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} disabled={busy} onChange={event=>setOtp(event.target.value.replace(/\D/g,'').slice(0,6))}/></label>}
      {error&&<p className="deletion-approval-error" role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={()=>onComplete(false)}>Cancel</button><button type="submit" disabled={busy||!preview.deliveryConfigured||(!sent&&(!reason.trim()||confirmation!==expected))||(sent&&otp.length!==6)}>{busy?'Verifying…':sent?'Verify and perform approved action':'Send WhatsApp OTP'}</button></footer>
    </form>
  </section></div>;
}

let pending=Promise.resolve();
function showApproval(props) {
  const open=()=>new Promise(resolve=>{
    if(props.signal?.aborted)return resolve(false);
    const host=document.createElement('div');document.body.appendChild(host);
    const root=createRoot(host);let finished=false;
    const onComplete=value=>{if(finished)return;finished=true;queueMicrotask(()=>{root.unmount();host.remove();resolve(value);});};
    root.render(<ApprovalDialog {...props} onComplete={onComplete}/>);
  });
  const result=pending.then(open,open);pending=result.catch(()=>false);return result;
}

export const fetchWithDeletionApproval=(performFetch,input,init)=>approvalFetch(performFetch,input,init,showApproval);
