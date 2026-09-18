// Direct printing through the QZ Tray print helper installed on the PC.
// A web page cannot choose the paper size in the browser's print window, but
// the helper can: the job is sent straight to the printer with the A3 / A4
// size chosen in Smart Print. When the helper is not installed or the job
// fails, callers fall back to the normal browser print window.

const PRINTER_STORAGE_KEY='nerveCenterDirectPrinter';
const HELPER_SEEN_KEY='nerveCenterPrintHelperSeen';
const UNAVAILABLE_RETRY_MS=60_000;
const LAUNCH_POLL_MS=1500;
const HELPER_PORTS={secure:'wss://localhost:8181',insecure:'ws://localhost:8182'};
let qzPromise=null,unavailableUntil=0,pendingHandshake=null,lastFailure='';

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

/** True once this browser has reached the helper (or remembers a printer from it): from then on it is expected, never silently skipped. */
export function printHelperExpected(storage=globalThis.localStorage){try{return storage?.getItem(HELPER_SEEN_KEY)==='1'||Boolean(String(storage?.getItem(PRINTER_STORAGE_KEY)||'').trim())}catch{return false}}
function markHelperSeen(storage=globalThis.localStorage){try{storage?.setItem(HELPER_SEEN_KEY,'1')}catch{/* private mode */}}
/** Why the last availability check failed, for the message shown to the user ('' when it succeeded). */
export function printHelperLastFailure(){return lastFailure}

/** Starts QZ Tray through the "qz:" link it registers in Windows. A hidden frame keeps the app page where it is. */
export function launchPrintHelper(doc=globalThis.document){
  try{
    const frame=doc.createElement('iframe');
    frame.style.display='none';
    frame.src='qz:launch';
    doc.body.appendChild(frame);
    setTimeout(()=>frame.remove(),8000).unref?.();
    return true;
  }catch{return false}
}

/**
 * Is the helper running? Opens a plain socket to it and closes it again. This needs no "Allow" from the
 * user, unlike the helper's own connect handshake, so it can answer within a couple of seconds.
 */
export function probePrintHelper({timeoutMs=2500,WebSocketImpl=globalThis.WebSocket,secure=globalThis.location?.protocol==='https:'}={}){
  return new Promise((resolve)=>{
    if(typeof WebSocketImpl!=='function')return resolve(false);
    let settled=false;
    const finish=(value)=>{if(!settled){settled=true;clearTimeout(timer);resolve(value)}};
    const timer=setTimeout(()=>finish(false),timeoutMs);
    try{
      const socket=new WebSocketImpl(secure?HELPER_PORTS.secure:HELPER_PORTS.insecure);
      socket.onopen=()=>{finish(true);try{socket.close()}catch{/* closing a probe */}};
      socket.onerror=()=>finish(false);
      socket.onclose=()=>finish(false);
    }catch{finish(false)}
  });
}

const pause=(milliseconds)=>new Promise((resolve)=>setTimeout(resolve,milliseconds));
// The timer is cleared as soon as the promise settles, so a long wait never lingers after the answer.
const withTimeout=(promise,milliseconds,message)=>{
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds)})]).finally(()=>clearTimeout(timer));
};

/** A small notice on the page while the helper waits for the user's answer in its own window. */
function helperNotice(text,doc=globalThis.document){
  try{
    const node=doc.createElement('div');
    node.className='print-helper-notice';
    node.setAttribute('role','status');
    node.textContent=text;
    doc.body.appendChild(node);
    return ()=>node.remove();
  }catch{return ()=>{}}
}

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
 * The helper's own handshake. It completes only after the user answers the helper's "Allow" question
 * (or at once when the app is trusted), so it may take as long as the user takes. A second print
 * while the question is still open waits on the same handshake instead of failing.
 */
async function handshake(qz,{handshakeWaitMs,notice}){
  if(qz.websocket.isActive())return;
  if(!pendingHandshake){
    const hide=notice('Waiting for the print helper: if QZ Tray asks, click Allow in its window (it may be behind this one).');
    pendingHandshake=withTimeout(qz.websocket.connect({retries:0,delay:0}),handshakeWaitMs,'QZ Tray did not answer. Look for its Allow window and try again.')
      .finally(()=>{pendingHandshake=null;hide()});
  }
  await pendingHandshake;
}

/**
 * True when the print helper is reachable and connected.
 * - A PC that never used the helper: one quick presence probe; a miss is remembered for a minute so printing never stalls.
 * - A PC that has used it before: the helper is expected. If it is not running it is started through its
 *   "qz:" link and probed again for up to `launchWaitMs`, with no negative memory.
 * - Once present, the handshake waits for the user's Allow for up to `handshakeWaitMs`.
 */
export async function printHelperAvailable({token,timeoutMs=2500,now=Date.now(),load=loadHelper,probe=probePrintHelper,storage=globalThis.localStorage,launch=launchPrintHelper,launchWaitMs=20_000,handshakeWaitMs=180_000,sleep=pause,notice=helperNotice}={}){
  lastFailure='';
  const expected=printHelperExpected(storage);
  if(!expected&&now<unavailableUntil)return false;
  let present=await probe({timeoutMs});
  if(!present&&!expected){unavailableUntil=now+UNAVAILABLE_RETRY_MS;lastFailure='not-installed';return false}
  if(!present){
    launch();
    for(let waited=0;waited<launchWaitMs&&!present;waited+=LAUNCH_POLL_MS){await sleep(LAUNCH_POLL_MS);present=await probe({timeoutMs});}
    if(!present){lastFailure='not-running';return false}
  }
  markHelperSeen(storage);
  try{
    const qz=await load(token);
    await handshake(qz,{handshakeWaitMs,notice});
    return true;
  }catch(error){
    lastFailure=String(error?.message||error||'The print helper refused the connection.');
    return false;
  }
}

export function rememberedPrinter(storage=globalThis.localStorage){try{return String(storage?.getItem(PRINTER_STORAGE_KEY)||'').trim()}catch{return ''}}
export function rememberPrinter(name,storage=globalThis.localStorage){try{if(name)storage?.setItem(PRINTER_STORAGE_KEY,name);else storage?.removeItem(PRINTER_STORAGE_KEY)}catch{/* private mode */}}

/**
 * Sends a PDF to the printer on the given page size. Uses the remembered
 * printer, else the PC's default printer. Resolves with the printer name.
 */
export async function printPdfDirect({pdf,page,jobName,token,notice=helperNotice}){
  const qz=await loadHelper(token);
  await handshake(qz,{handshakeWaitMs:180_000,notice});
  const data=await blobToBase64(pdf);
  // One helper call per job once the printer is known, so an unsigned setup asks "Allow" only once.
  const send=async(printer)=>{
    if(!printer)throw new Error('No default printer is set on this PC.');
    const config=qz.configs.create(printer,directPrintOptions(page,jobName));
    const hide=notice('Sending to the printer: if QZ Tray asks, click Allow in its window.');
    try{await qz.print(config,[{type:'pixel',format:'pdf',flavor:'base64',data}])}finally{hide()}
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
