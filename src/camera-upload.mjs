// Keep the original file input as the single source of truth, including native
// required validation and the form's existing React change/upload handlers.
const pending=new WeakMap();
export function capturePhotoForInput(target,{notify=globalThis.alert}={}) {
  if(!target||target.disabled)return;
  pending.get(target)?.();
  const accept=target.getAttribute('accept'),capture=target.getAttribute('capture');
  const restore=()=>{
    for(const [name,value] of [['accept',accept],['capture',capture]]){
      if(value===null)target.removeAttribute(name);else target.setAttribute(name,value);
    }
    for(const event of ['change','cancel','click'])target.removeEventListener(event,restore);
    pending.delete(target);
  };
  target.setAttribute('accept','image/*');
  target.setAttribute('capture','environment');
  target.addEventListener('change',restore);
  target.addEventListener('cancel',restore);
  pending.set(target,restore);
  try{
    // Keep the connected input and native change event; no FileList copying.
    target.click();
    // Restore on the next Choose file click if the browser emits no cancel.
    if(pending.has(target))target.addEventListener('click',restore);
  }catch{
    restore();
    notify?.('The camera could not be opened. Please use Choose file to attach a photo.');
  }
}
