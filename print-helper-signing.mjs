// Signs print requests for the QZ Tray print helper, so the helper can print
// without asking the user to click "Allow" on every job. The helper checks the
// signature against the certificate the app presents (and that the PC trusts).
// Both values come from the environment and are never sent to the browser,
// except the public certificate, which is public by design.
import {createSign,X509Certificate} from 'node:crypto';

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

/**
 * Signing material in use: the environment settings win; otherwise the pair the application created for itself
 * and keeps in its database. `source` tells which one, or null when printing is still unsigned.
 */
export function resolvePrintHelperSigning({env=process.env,stored={}}={}){
  const fromEnvironment=printHelperSigning(env);
  if(fromEnvironment.configured)return {...fromEnvironment,source:'environment'};
  const certificate=normalizePem(stored?.certificate),privateKey=normalizePem(stored?.privateKey);
  const configured=Boolean(certificate&&privateKey);
  return {certificate,privateKey,configured,source:configured?'database':null};
}

/** Public facts about a certificate, for the setup page. Never includes key material. */
export function certificateSummary(certificate){
  try{
    const parsed=new X509Certificate(normalizePem(certificate));
    return {subject:parsed.subject.replace(/\n/g,', '),validTo:new Date(parsed.validTo).toISOString(),fingerprint:parsed.fingerprint256};
  }catch{return {subject:'',validTo:'',fingerprint:''}}
}

/**
 * Creates the application's own signing pair: RSA-2048 and a self-signed CA-style certificate valid for 20 years,
 * the same shape QZ Tray's guide produces with OpenSSL, so the helper accepts it as its trusted override.
 */
export async function generatePrintHelperSigning({now=new Date(),generate}={}){
  const create=generate||(await import('selfsigned')).default.generate;
  const pems=await create([{name:'commonName',value:'Nerve Center Smart Print'},{name:'organizationName',value:'Caliber Mining and Logistics Limited'}],{
    keySize:2048,algorithm:'sha256',notBeforeDate:new Date(now.getTime()-86400000),notAfterDate:new Date(now.getTime()+20*365*86400000),
    extensions:[{name:'basicConstraints',cA:true,critical:true},{name:'keyUsage',digitalSignature:true,keyCertSign:true,critical:true}],
  });
  const certificate=normalizePem(pems.cert),privateKey=normalizePem(pems.private);
  if(!certificate||!privateKey)throw new Error('The certificate could not be created.');
  return {certificate,privateKey};
}

/** Base64 SHA512-with-RSA signature of the helper's request string, as QZ Tray expects. */
export function signPrintRequest(request,privateKey){
  const text=String(request??'');
  if(!text||text.length>PRINT_HELPER_MAX_REQUEST_LENGTH)throw Object.assign(new Error('A valid print request is required.'),{status:400});
  if(!privateKey)throw Object.assign(new Error('Print request signing is not configured.'),{status:503});
  return createSign('RSA-SHA512').update(text).sign(privateKey,'base64');
}
