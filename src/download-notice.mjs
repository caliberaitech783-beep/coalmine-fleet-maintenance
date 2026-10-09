// Each transfer owns its notice, so simultaneous downloads cannot overwrite it.
export function beginDownload(label='File',doc=globalThis.document){
  if(!doc?.body)return {success(){},error(){}};
  const host=doc.createElement('div'),message=doc.createElement('span'),dismiss=doc.createElement('button');
  host.setAttribute('role','status');host.setAttribute('aria-live','polite');host.setAttribute('aria-atomic','true');
  host.setAttribute('popover','manual');
  Object.assign(host.style,{position:'fixed',inset:'auto 16px 20px auto',margin:'0',maxWidth:'min(440px, calc(100vw - 32px))',padding:'16px',border:'0',borderRadius:'12px',background:'#522e90',color:'#fff',boxShadow:'0 6px 24px #0004',zIndex:'2147483647',font:'600 15px/1.5 sans-serif'});
  dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label','Dismiss download notification');
  Object.assign(dismiss.style,{marginLeft:'12px',background:'transparent',color:'#fff',border:'1px solid #ffffff88',borderRadius:'6px',padding:'6px 12px',cursor:'pointer'});
  host.append(message,dismiss);doc.body.append(host);
  // Popovers render above native modal dialogs without taking keyboard focus.
  try{host.showPopover?.();}catch{}
  let timer;
  const close=()=>{clearTimeout(timer);host.remove();};dismiss.onclick=close;
  message.textContent=`Preparing ${label}…`;
  return {
    success(){message.textContent=`${label}: download started. Check your browser downloads.`;host.style.background='#166534';timer=setTimeout(close,10000);timer?.unref?.();},
    error(error){message.textContent=error?.name==='AbortError'?'Download cancelled.':`${label}: ${error?.message||'Download failed. Please try again.'}`;host.style.background='#991b1b';timer=setTimeout(close,15000);timer?.unref?.();},
  };
}

export async function runDownloadNotice(label,task){
  const notice=beginDownload(label);
  try{await new Promise(resolve=>setTimeout(resolve,50));const result=await task();notice.success();return result;}
  catch(error){notice.error(error);}
}
