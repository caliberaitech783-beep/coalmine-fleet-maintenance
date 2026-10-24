// Run read-only checks in the production App Service environment. Staging has
// its own database, and the deployment runner cannot resolve the private DB.
// Azure credentials remain in memory; runtime secrets are never exported.
import {execFileSync} from 'node:child_process';
const scope=['-g',process.env.AZURE_RESOURCE_GROUP||'coalmine-fleet-maintenance-rg','-n',process.env.AZURE_WEBAPP_NAME||'coalmine-fleet-azure-783'];
const az=args=>JSON.parse(execFileSync('az',[...args,'--only-show-errors','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
let stage='Azure authorization';
try{
  const hosts=az(['webapp','show',...scope,'--query','enabledHostNames']);
  const host=hosts.find(host=>host.includes('.scm.'));
  if(!host)throw Error('SCM unavailable');
  const token=az(['account','get-access-token','--resource','https://management.azure.com/']).accessToken;
  const remote=String.raw`import pg from 'pg';
import {TELEGRAM_SITES,normalizeTelegramSiteGroups} from './telegram-site-groups.mjs';
import {telegramSiteGroupDetails} from './telegram.mjs';
let pool;
try{
const env=process.env;
if(!env.DATABASE_URL||!env.TELEGRAM_BOT_TOKEN)throw Object.assign(Error(),{code:'CONFIGURATION_MISSING'});
pool=new pg.Pool({connectionString:env.DATABASE_URL,ssl:env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false},connectionTimeoutMillis:10000,max:1});
const {rows}=await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='telegram_site_groups'");
const groups=normalizeTelegramSiteGroups(rows[0]?.setting_value);
const sites=await Promise.all(TELEGRAM_SITES.map(async site=>{
const group=groups.find(group=>group.site===site);let botReady=false;
if(group)try{await telegramSiteGroupDetails(group.chatId,{env,fetchImpl:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(5000)})});botReady=true;}catch{}
return {site,registered:Boolean(group),botReady};
}));
console.log(JSON.stringify({source:'production',ready:sites.every(site=>site.botReady),sites}));
}catch(error){console.log(JSON.stringify({ready:false,code:/^[A-Z0-9_]{1,60}$/.test(String(error.code||''))?error.code:'UNAVAILABLE'}));process.exitCode=1;}
finally{await pool?.end();}`;
  const quote=value=>"'"+value.replace(/'/g,"'\"'\"'")+"'";
  const body=JSON.stringify({command:`node --input-type=module -e ${quote(remote)}`,dir:'/home/site/wwwroot'});
  stage='Production runtime probe';
  let response=await fetch(`https://${host}/api/command`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(60000)});
  if(response.status===401){
    const credentials=az(['webapp','deployment','list-publishing-credentials',...scope]);
    response=await fetch(`https://${host}/api/command`,{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${credentials.publishingUserName}:${credentials.publishingPassword}`).toString('base64')}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(60000)});
  }
  if(!response.ok)throw Error('Probe HTTP '+response.status);
  const output=await response.json();
  console.log(JSON.stringify({runtimeProbe:{exitCode:output.ExitCode,fields:Object.keys(output),nodeMissing:/node.*not found|node.*not recognized/i.test(String(output.Error||'')),moduleMissing:/Cannot find package|Cannot find module/i.test(String(output.Error||'')),syntaxError:/SyntaxError/.test(String(output.Error||''))}}));
  const result=JSON.parse(String(output.Output||'').trim().split('\n').filter(line=>line.startsWith('{')).at(-1)||'{}');
  console.log(JSON.stringify(result));
  if(result.ready!==true){
    console.error('Membership release stopped: register all eight site groups and grant the bot administrator and invitation permissions.');process.exitCode=1;
  }
}catch{
  console.error(JSON.stringify({preflightFailed:true,stage}));process.exitCode=1;
}
