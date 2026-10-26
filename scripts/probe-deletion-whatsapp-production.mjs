// Inspect the existing production WhatsApp configuration without exporting keys.
// --send additionally sends one approved test OTP to the fixed owner number.
// Application files, settings and database records are never changed.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {META_WORKFLOW_TEMPLATES} from '../whatsapp-template-catalog.mjs';

const send=process.argv.includes('--send');
const runtimeOnly=process.argv.includes('--runtime-only');
const scope=['--subscription',process.env.AZURE_SUBSCRIPTION_ID||'58ca09cf-ab5d-47a8-a438-e1fb2a40d030',
 '-g',process.env.AZURE_RESOURCE_GROUP||'coalmine-fleet-maintenance-rg','-n',process.env.AZURE_WEBAPP_NAME||'coalmine-fleet-azure-783'];
if(process.env.AZURE_WEBAPP_SLOT)scope.push('--slot',process.env.AZURE_WEBAPP_SLOT);
const az=args=>{
  const all=[...args,'--only-show-errors','-o','json'];
  const executable=process.env.AZURE_CLI_PYTHON;
  return JSON.parse(execFileSync(executable||'az',executable?['-IBm','azure.cli',...all]:all,
    {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}));
};
let stage='Azure authorization';
try{
  const host=az(['webapp','show',...scope,'--query','enabledHostNames']).find(value=>value.includes('.scm.'));
  if(!host)throw Error('SCM unavailable');
  const token=az(['account','get-access-token','--resource','https://management.azure.com/']).accessToken;
  const adapter=readFileSync(new URL('../deletion-sms.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const hashes=readFileSync(new URL('../password-auth.mjs',import.meta.url),'utf8').split('export function initializeUserCredentials')[0]
    .replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const remote=String.raw`(async()=>{
let pool;let phase='dependencies';
try{
 const {randomInt,randomBytes,scryptSync,timingSafeEqual,randomUUID,createHash}=await import('node:crypto');
 if(${runtimeOnly}){
  const {readFileSync}=await import('node:fs');
  const read=path=>{try{return readFileSync('/home/site/wwwroot/'+path,'utf8');}catch{return '';}};
  const db=new URL(process.env.DATABASE_URL);
  const dbIdentityHash=createHash('sha256').update(db.hostname+db.pathname).digest('hex');
  const html=read('dist/index.html');const entry=html.match(/src="(\/app-assets\/[^\"]+\.js)"/)?.[1];
  const commit=String(process.env.DEPLOYMENT_SHA||read('DEPLOYMENT_SHA')).trim();
  console.log(JSON.stringify({ready:true,runtime:{dbIdentityHash,commit,scheduledJobsDisabled:process.env.DISABLE_SCHEDULED_JOBS==='true',
   otpGuardPresent:read('server.mjs').includes('installDeletionApproval(app'),
   frontendWhatsAppPrompt:Boolean(entry&&read('dist'+entry).includes('Send WhatsApp OTP'))}}));return;
 }
 const {createRequire}=await import('node:module');
 let require=createRequire('/home/site/wwwroot/server.mjs');let pg;
 try{pg=require('pg');}catch(error){
  if(error.code!=='MODULE_NOT_FOUND')throw error;
  phase='temporary diagnostic dependencies';
  const {mkdirSync}=await import('node:fs');const {execFileSync}=await import('node:child_process');
  const temporary='/tmp/codex-whatsapp-probe-'+randomUUID();mkdirSync(temporary,{mode:0o700});
  execFileSync('npm',['install','--prefix',temporary,'--ignore-scripts','--omit=dev','--no-audit','--no-fund','pg@8.16.3'],{stdio:['ignore','pipe','pipe'],timeout:30000});
  pg=createRequire(temporary+'/package.json')('pg');
 }
 ${hashes}
 const META_WORKFLOW_TEMPLATES=${JSON.stringify({passwordResetOtp:{name:META_WORKFLOW_TEMPLATES.passwordResetOtp.name}})};
 ${adapter}
 phase='database settings';
 pool=new pg.Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false},connectionTimeoutMillis:10000,statement_timeout:10000,max:1});
 async function readSettings(){
  const client=await pool.connect();
  try{await client.query('BEGIN READ ONLY');const {rows}=await client.query('SELECT setting_value FROM app_settings WHERE setting_key=$1',['meta_whatsapp']);await client.query('COMMIT');return rows[0]?.setting_value||{};}
  catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
 }
 const settings=await readSettings();const service=createDeletionWhatsApp({readSettings});
 const status=await service.status();
 if(!status.configured){console.log(JSON.stringify({source:'production',ready:false,status}));return;}
 const config=deletionWhatsAppConfiguration(process.env,settings);
 phase='authentication template';
 const response=await fetch('https://www.fast2sms.com/dev/whatsapp/'+config.version+'/'+config.businessAccountId+'/message_templates?name='+encodeURIComponent(config.templateName)+'&fields=name,status,category,language',{headers:{Authorization:config.apiKey},signal:AbortSignal.timeout(15000)});
 const result=await response.json().catch(()=>null);
 const template=Array.isArray(result?.data)?result.data.find(value=>value.name===config.templateName&&value.language===config.language):null;
 const ready=response.ok&&template?.status==='APPROVED'&&template?.category==='AUTHENTICATION';
 const output={source:'production',ready,status,templateStatus:template?.status||'Unavailable',templateCategory:template?.category||'Unavailable',testAccepted:false};
 if(${send}&&ready){phase='WhatsApp test send';await service.send();output.testAccepted=true;}
 console.log(JSON.stringify(output));
}catch(error){console.log(JSON.stringify({source:'production',ready:false,stage:phase,code:/^[A-Z0-9_]{1,60}$/.test(String(error.code||''))?error.code:'UNAVAILABLE'}));process.exitCode=1;}
finally{await pool?.end();}
})().catch(()=>{console.log(JSON.stringify({ready:false,code:'PROBE_EXECUTION_FAILED'}));process.exitCode=1;});`;
  const encoded=Buffer.from(remote).toString('base64');
  const body=JSON.stringify({command:`node --input-type=module -e "eval(Buffer.from('${encoded}','base64').toString())"`,dir:'/home/site/wwwroot'});
  stage='Production runtime probe';
  let response=await fetch(`https://${host}/api/command`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(90000)});
  if(response.status===401){
    const credentials=az(['webapp','deployment','list-publishing-credentials',...scope]);
    response=await fetch(`https://${host}/api/command`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${credentials.publishingUserName}:${credentials.publishingPassword}`).toString('base64')}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(90000)});
  }
  if(!response.ok)throw Error('Runtime probe unavailable');
  const output=await response.json();
  const result=JSON.parse(String(output.Output||'').trim().split('\n').filter(line=>line.startsWith('{')).at(-1)||'{}');
  if(!Object.hasOwn(result,'ready'))throw Error('No safe probe result');
  console.log(JSON.stringify(result,null,2));
  if(result.ready!==true || (send&&!result.testAccepted))process.exitCode=1;
}catch{
  console.error(JSON.stringify({ready:false,stage,code:'PROBE_UNAVAILABLE',smsOrWhatsappDeliveryUnknown:send}));
  process.exitCode=1;
}
