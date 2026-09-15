import React, {useState} from 'react';
import {capturePhotoForInput} from './camera-upload.mjs';
import './complaint-media.css';

export function ComplaintMediaInputs() {
  return <fieldset className="full complaint-media-inputs"><legend>Reason / complaint — photo and video (optional)</legend>
    <label>Photo<input name="complaintPhoto" type="file" accept="image/jpeg,image/png,image/webp" />
      <button type="button" className="camera-upload-button" onClick={event=>capturePhotoForInput(event.currentTarget.previousElementSibling)}>Take photo</button></label>
    <label>Video<input name="complaintVideo" type="file" accept="video/mp4,video/webm,video/quicktime" />
      <button type="button" className="camera-upload-button" onClick={event=>capturePhotoForInput(event.currentTarget.previousElementSibling,{accept:'video/mp4,video/webm,video/quicktime'})}>Record video</button></label>
    <small>One photo and one video, up to 5 MB each. Camera recording depends on your device and browser. Text and voice input remain available.</small>
  </fieldset>;
}
export function ComplaintMediaView({request,token,Dialog}) {
  const [open,setOpen]=useState(false),[items,setItems]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  if (!request.complaintMediaAvailable) return null;
  const load=async()=>{setOpen(true);setLoading(true);setError('');try {
    const response=await fetch('/api/requests/'+encodeURIComponent(request.ref)+'/complaint-media',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load attachments');setItems(data.items||[]);
  }catch(e){setError(e.message);}finally{setLoading(false);}};
  return <><button type="button" className="secondary compact" onClick={load}>View photo / video</button>{open&&<Dialog title="Complaint photo / video" close={()=>{setOpen(false);setItems([]);}}>
    {loading&&<p>Loading attachments…</p>}{error&&<p role="alert">{error}</p>}
    {items.map((item,index)=><figure key={index}>{item.data.startsWith('data:video/')?<video controls playsInline preload="metadata" src={item.data} style={{maxWidth:'100%',maxHeight:'60vh'}} />:<img src={item.data} alt={item.name||'Complaint photo'} style={{maxWidth:'100%',maxHeight:'60vh',objectFit:'contain'}} />}<figcaption>{item.name}</figcaption></figure>)}
  </Dialog>}</>;
}
