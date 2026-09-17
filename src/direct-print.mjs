// Direct printing through the QZ Tray print helper installed on the PC.
// A web page cannot choose the paper size in the browser's print window, but
// the helper can: the job is sent straight to the printer with the A3 / A4
// size chosen in Smart Print. When the helper is not installed or the job
// fails, callers fall back to the normal browser print window.

const PRINTER_STORAGE_KEY='nerveCenterDirectPrinter';
const HELPER_SEEN_KEY='nerveCenterPrintHelperSeen';
const UNAVAILABLE_RETRY_MS=60_000;
const LAUNCH_POLL_MS=1500;
let qzPromise=null,unavailableUntil=0;

/** True once this browser has reached or printed through the helper (a remembered printer counts): from then on the helper is expected, never silently skipped. */
export function printHelperExpected(storage=globalThis.localStorage){try{return storage?.getItem(HELPER_SEEN_KEY)==='1'||Boolean(String(storage?.getItem(PRINTER_STORAGE_KEY)||'').trim())}catch{return false}}
function markHelperSeen(storage=globalThis.localStorage){try{storage?.setItem(HELPER_SEEN_KEY,'1')}catch{/* private mode */}}

/** Starts QZ Tray through the "qz:" link it registers in Windows. A hidden frame keeps the app page where it is. */
export function launchPrintHelper(doc=globalThis.document){
  try{
    const frame=doc.createElement('iframe');
    frame.style.display='none';
    frame.src='qz:launch';
    doc.body.appendChild(frame);
    setTimeout(()=>frame.remove(),8000);
    return true;
  }catch{return false}
}
const pause=(milliseconds)=>new Promise((resolve)=>setTimeout(resolve,milliseconds));

/** Paper definition for the helper: portrait millimetres; the landscape PDF page is rotated to fit by the helper. */
export function directPrintPaper(page={}){
  const width=Math.min(Number(page.widthMm)||0,Number(page.heightMm)||0),height=Math.max(Number(page.widthMm)||0,Number(page.heightMm)||0);
  if(!(width>0)||!(height>0))throw new Error('A valid page size is required.');
  return {size:{width,height},units:'mm'};
}

/** Options for one print job: the chosen paper, content scaled to it, colour, and a readable job name. */
export function directPrintOptions(page,jobName=''){
  return {...directPrintPaper(page),scaleContent:true,colorType:'color',jobName:String(jobName||'Nerve Center report').replace(/\s+/g,' ').trim().slice(0,120)||'Nerve Center report'};
}

export async function blobToBase64(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  let binary='';
  for(let index=0;index<bytes.length;index+=0x8000)binary+=String.fromCharCode(...bytes.subarray(index,index+0x8000));
  return btoa(binary);
}

const withTimeout=(promise,milliseconds,message)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(message)),milliseconds))]);

async function loadHelper(token){
  if(!qzPromise)qzPromise=import('qz-tray').then((module)=>{
    const qz=module.default||module;
    const headers=()=>({Authorization:`Bearer ${typeof token==='function'?token():token}`});
    // The app's certificate and a server-side signature let the helper print without an "Allow" prompt.
    // With signing not configured both resolve empty and the helper simply asks the user.
    qz.security.setCertificatePromise((resolve)=>{
      fetch('/api/print-helper/certificate',{cache:'no-store',headers:headers()}).then((response)=>response.ok&&response.status!==204?response.text():'').then((certificate)=>resolve(certificate||undefined)).catch(()=>resolve());
    });
    qz.security.setSignatureAlgorithm('SHA512');
    qz.security.setSignaturePromise((request)=>(resolve)=>{
      fetch('/api/print-helper/sign',{method:'POST',cache:'no-store',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify({request})})
        .then((response)=>response.ok&&response.status!==204?response.json():{}).then((body)=>resolve(body.signature||undefined)).catch(()=>resolve());
    });
    return qz;
  }).catch((error)=>{qzPromise=null;throw error});
  return qzPromise;
}

/**
 * True when the print helper is reachable on this PC.
 * - A PC that has never used the helper: one quick try; a miss is remembered for a minute so printing never stalls.
 * - A PC that has used it before: the helper is expected. If it is not running it is started through its
 *   "qz:" link and the connection is retried for up to `launchWaitMs`, with no negative memory.
 */
export async function printHelperAvailable({token,timeoutMs=2500,now=Date.now(),load=loadHelper,storage=globalThis.localStorage,launch=launchPrintHelper,launchWaitMs=20_000,sleep=pause}={}){
  const expected=printHelperExpected(storage);
  if(!expected&&now<unavailableUntil)return false;
  const connect=async()=>{
    const qz=await load(token);
    if(!qz.websocket.isActive())await withTimeout(qz.websocket.connect({retries:0,delay:0}),timeoutMs,'The print helper did not answer.');
    markHelperSeen(storage);
    return true;
  };
  try{return await connect()}catch{/* not running, or not installed */}
  if(!expected){unavailableUntil=now+UNAVAILABLE_RETRY_MS;return false}
  launch();
  for(let waited=0;waited<launchWaitMs;waited+=LAUNCH_POLL_MS){
    await sleep(LAUNCH_POLL_MS);
    try{return await connect()}catch{/* still starting */}
  }
  return false;
}

export function rememberedPrinter(storage=globalThis.localStorage){try{return String(storage?.getItem(PRINTER_STORAGE_KEY)||'').trim()}catch{return ''}}
export function rememberPrinter(name,storage=globalThis.localStorage){try{if(name)storage?.setItem(PRINTER_STORAGE_KEY,name);else storage?.removeItem(PRINTER_STORAGE_KEY)}catch{/* private mode */}}

/**
 * Sends a PDF to the printer on the given page size. Uses the remembered
 * printer, else the PC's default printer. Resolves with the printer name.
 */
export async function printPdfDirect({pdf,page,jobName,token}){
  const qz=await loadHelper(token);
  if(!qz.websocket.isActive())await qz.websocket.connect({retries:0,delay:0});
  const data=await blobToBase64(pdf);
  // One helper call per job once the printer is known, so an unsigned setup asks "Allow" only once.
  const send=async(printer)=>{
    if(!printer)throw new Error('No default printer is set on this PC.');
    const config=qz.configs.create(printer,directPrintOptions(page,jobName));
    await qz.print(config,[{type:'pixel',format:'pdf',flavor:'base64',data}]);
    rememberPrinter(printer);
    return printer;
  };
  const remembered=rememberedPrinter();
  if(!remembered)return send(await qz.printers.getDefault());
  try{return await send(remembered)}
  catch(error){
    // A remembered printer that was removed or renamed falls back to the PC's current default printer.
    if(!/printer|not\s*found|cannot find/i.test(String(error?.message||error)))throw error;
    rememberPrinter('');
    return send(await qz.printers.getDefault());
  }
}
