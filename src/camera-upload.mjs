// Keep the original file input as the single source of truth, including native
// required validation and the form's existing React change/upload handlers.
export function capturePhotoForInput(target,{document:doc=globalThis.document,DataTransfer:Transfer=globalThis.DataTransfer,Event:InputEvent=globalThis.Event,notify=globalThis.alert,accept='image/jpeg,image/png,image/webp'}={}) {
  if(!target||target.disabled)return;
  const picker=doc.createElement('input');
  picker.type='file';
  picker.accept=accept;
  picker.setAttribute('capture','environment');
  picker.onchange=()=>{
    const file=picker.files?.[0];
    if(!file)return;
    try{
      const transfer=new Transfer();
      transfer.items.add(file);
      target.files=transfer.files;
      target.dispatchEvent(new InputEvent('change',{bubbles:true}));
    }catch{
      notify?.('This browser could not attach the photo. Please use Choose file to select your saved photo.');
    }
  };
  picker.click();
}
