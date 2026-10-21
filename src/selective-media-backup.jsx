import React,{useState} from 'react';
import DateInput from './date-input.mjs';

export default function SelectiveMediaBackup({token}){
  const [before,setBefore]=useState('2026-10-01'),[preview,setPreview]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[file,setFile]=useState(null),[inspection,setInspection]=useState(null),[confirmation,setConfirmation]=useState('');
  const headers={Authorization:`Bearer ${token}`};
  const json=async(url,body)=>{
    const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:{...headers,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const result=await response.json();if(!response.ok)throw Error(result.error||'Backup operation failed.');return result;
  };
  const run=async(label,action)=>{setBusy(label);setError('');setNotice('');try{await action();}catch(problem){setError(problem.message);}finally{setBusy('');}};
  const inspect=()=>run('Uploading ZIP',async()=>{
    if(!file)throw Error('Choose the selective media ZIP.');
    const {token:upload}=await json('/api/selective-media/import',{size:file.size});
    for(let offset=0;offset<file.size;offset+=8*1024**2){
      setBusy(`Uploading ZIP ${Math.floor(offset/file.size*100)}%`);
      const response=await fetch(`/api/selective-media/import/${upload}/chunk?offset=${offset}`,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'},body:file.slice(offset,offset+8*1024**2)});
      if(!response.ok){const result=await response.json();throw Error(result.error||'Upload failed.');}
    }
    setBusy('Verifying every file checksum');
    const result=await json(`/api/selective-media/import/${upload}/inspect`,{});setInspection({...result,token:upload});setConfirmation('');
  });
  return <section className="panel" aria-label="Selective media backup and restore">
    <h2>Selective media backup and restore</h2>
    <p>Back up opening, closing and first-trip cards (including PDF evidence), plus complaint and maintenance audio. Only requests MIS-verified before the chosen date at midnight IST are included. October and later verification dates and unverified requests stay untouched when the cutoff is 01-10-26. Export never deletes media.</p>
    <label>MIS verified before (exclusive, IST)<DateInput value={before} onChange={event=>{setBefore(event.target.value);setPreview(null);}} disabled={Boolean(busy)} /></label>
    <button type="button" disabled={Boolean(busy)||!before} onClick={()=>run('Checking selection',async()=>setPreview(await json(`/api/selective-media/preview?before=${encodeURIComponent(before)}`)))}>Preview media selection</button>
    {preview&&<p>{preview.requests.toLocaleString('en-IN')} requests · {(preview.storedBytes/1024**3).toFixed(2)} GB stored media before {preview.cutoffDay} IST. ZIP size may differ.</p>}
    <button type="button" disabled={Boolean(busy)||!preview?.requests||preview.cutoffDay!==before} onClick={()=>run('Preparing ZIP download',async()=>{
      const result=await json('/api/selective-media/export',{before});
      const link=document.createElement('a');link.href=result.url;link.download=result.fileName;document.body.appendChild(link);link.click();link.remove();
      setNotice(`ZIP download started: ${result.fileName}. Wait for your browser to show Completed before relying on the backup. It contains original files and a checksum manifest. Nothing was deleted.`);
    })}>Download selected media ZIP</button>
    <h3>Verify or restore a selective media ZIP</h3>
    <p>Choose the complete ZIP to verify every file checksum. Restore fills missing media only, preserves original filenames and formats, and rejects any different existing media. No request details or verification dates are changed.</p>
    <input type="file" accept=".zip,application/zip" disabled={Boolean(busy)} onChange={event=>{setFile(event.target.files?.[0]||null);setInspection(null);setConfirmation('');}} aria-label="Selective media ZIP" />
    <button type="button" disabled={Boolean(busy)||!file} onClick={inspect}>Upload and verify ZIP</button>
    {inspection&&<><p>Checksums verified: {inspection.files} files on {inspection.requests} requests · verified before {inspection.cutoffDay} IST.</p><label>Type RESTORE MISSING MEDIA<input value={confirmation} onChange={event=>setConfirmation(event.target.value)} disabled={Boolean(busy)} /></label><button type="button" disabled={Boolean(busy)||confirmation!=='RESTORE MISSING MEDIA'} onClick={()=>run('Restoring missing media',async()=>{
      const result=await json(`/api/selective-media/import/${inspection.token}/restore`,{confirmation});setInspection(null);setNotice(`Restored ${result.restored} missing files; ${result.unchanged} identical files were unchanged.`);
    })}>Restore missing media</button></>}
    {busy&&<p role="status">{busy}…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  </section>;
}
