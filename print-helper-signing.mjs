// Signs print requests for the QZ Tray print helper, so the helper can print
// without asking the user to click "Allow" on every job. The helper checks the
// signature against the certificate the app presents (and that the PC trusts).
// Both values come from the environment and are never sent to the browser,
// except the public certificate, which is public by design.
import {createSign} from 'node:crypto';

export const PRINT_HELPER_MAX_REQUEST_LENGTH=2048;

/**
 * Accepts a PEM as stored in an app setting: real newlines, literal "\n"
 * sequences, or the whole PEM base64-encoded on one line. Returns '' when the
 * value is empty or not a PEM.
 */
export function normalizePem(value=''){
  let text=String(value??'').trim();
  if(!text)return '';
  if(!text.includes('-----BEGIN')){
    try{text=Buffer.from(text,'base64').toString('utf8').trim()}catch{return ''}
  }
  text=text.replace(/\\r/g,'').replace(/\\n/g,'\n').replace(/\r\n/g,'\n');
  return /-----BEGIN [A-Z ]+-----[\s\S]+-----END [A-Z ]+-----/.test(text)?`${text}\n`:'';
}

/** The signing material configured for this deployment; `configured` is false until both parts are present. */
export function printHelperSigning(env=process.env){
  const certificate=normalizePem(env.QZ_SIGNING_CERTIFICATE);
  const privateKey=normalizePem(env.QZ_SIGNING_PRIVATE_KEY);
  return {certificate,privateKey,configured:Boolean(certificate&&privateKey)};
}

/** Base64 SHA512-with-RSA signature of the helper's request string, as QZ Tray expects. */
export function signPrintRequest(request,privateKey){
  const text=String(request??'');
  if(!text||text.length>PRINT_HELPER_MAX_REQUEST_LENGTH)throw Object.assign(new Error('A valid print request is required.'),{status:400});
  if(!privateKey)throw Object.assign(new Error('Print request signing is not configured.'),{status:503});
  return createSign('RSA-SHA512').update(text).sign(privateKey,'base64');
}
