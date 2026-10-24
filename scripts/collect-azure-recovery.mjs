// Runs only inside the existing OIDC-authorized GitHub workflow. Secrets stay
// in memory or protected runner files; only authenticated encrypted data leaves it.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Readable} from 'node:stream';
import {encryptStream} from '../backup-crypto.mjs';

const group=process.env.AZURE_RESOURCE_GROUP||'coalmine-fleet-maintenance-rg',app=process.env.AZURE_WEBAPP_NAME||'coalmine-fleet-azure-783';
const output=process.env.RUNNER_TEMP||'.',base='https://pulse.cmll.in';
const errors=[];
function az(args,optional=false){try{const value=execFileSync('az',[...args,'--only-show-errors','-o','json'],{encoding:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']});return value.trim()?JSON.parse(value):null;}catch(error){const code=/\(([A-Za-z][A-Za-z0-9]+)\)/.exec(String(error.stderr||''))?.[1]||error.code||error.name;const failure=args.slice(0,3).join(' ')+': '+code;if(!optional)throw Error('Azure recovery collection failed at '+failure);errors.push(failure);return null;}}
const settings=az(['webapp','config','appsettings','list','-g',group,'-n',app]);
let serviceKey=settings.find(item=>item.name==='FULL_BACKUP_SERVICE_KEY')?.value;
if(!serviceKey){
  serviceKey=randomBytes(48).toString('hex');const file=path.join(output,'full-backup-bootstrap.json');
  try{await writeFile(file,JSON.stringify({FULL_BACKUP_SERVICE_KEY:serviceKey}),{mode:0o600});az(['webapp','config','appsettings','set','-g',group,'-n',app,'--slot-settings','@'+file]);}
  finally{await rm(file,{force:true});}
}
let resources=az(['resource','list','-g',group],true);
if(!resources){
  const account=az(['account','show']);
  resources=az(['rest','--method','get','--url',`https://management.azure.com/subscriptions/${account.id}/resourceGroups/${group}/resources?api-version=2021-04-01`],true)?.value;
}
if(!resources){
  const apps=az(['webapp','list','-g',group],true)||[];
  if(!apps.some(item=>item.name===app)){const known=az(['webapp','show','-g',group,'-n',app],true);if(known)apps.push(known);}
  const servers=az(['postgres','flexible-server','list','-g',group],true)||[];
  const profiles=az(['afd','profile','list','-g',group],true)||[];
  resources=[...apps,...servers,...profiles];
}
const snapshot={format:'Caliber Pulse Azure recovery inventory',version:1,capturedAt:new Date().toISOString(),group:az(['group','show','-n',group],true),template:az(['group','export','-n',group,'--include-parameter-default-value'],true),resources:[],webapps:[],postgres:[],limitations:['External DNS/provider accounts and Key Vault secret values are not exported.','Private certificate keys, external object storage data, pre-existing media/session archives and database roles require separately tested protection.','ARM export may require template repair and re-entering secure parameters.'],errors};
for(const resource of resources)snapshot.resources.push(az(['resource','show','--ids',resource.id],true)||{id:resource.id,type:resource.type,unavailable:true});
snapshot.frontDoor=[];snapshot.dns=[];
for(const resource of resources.filter(r=>r.type.toLowerCase()==='microsoft.cdn/profiles')){
  const profile=resource.name,scope=['-g',group,'--profile-name',profile];
  const endpoints=az(['afd','endpoint','list',...scope],true)||[];
  const originGroups=az(['afd','origin-group','list',...scope],true)||[];
  const ruleSets=az(['afd','rule-set','list',...scope],true)||[];
  snapshot.frontDoor.push({profile,endpoints:endpoints.map(endpoint=>({...endpoint,routes:az(['afd','route','list',...scope,'--endpoint-name',endpoint.name],true)})),originGroups:originGroups.map(originGroup=>({...originGroup,origins:az(['afd','origin','list',...scope,'--origin-group-name',originGroup.name],true)})),ruleSets:ruleSets.map(ruleSet=>({...ruleSet,rules:az(['afd','rule','list',...scope,'--rule-set-name',ruleSet.name],true)})),customDomains:az(['afd','custom-domain','list',...scope],true),securityPolicies:az(['afd','security-policy','list',...scope],true)});
}
for(const resource of resources.filter(r=>r.type.toLowerCase()==='microsoft.network/dnszones'))snapshot.dns.push({zone:resource.name,records:az(['network','dns','record-set','list','-g',group,'-z',resource.name],true)});
// Other applications can share this resource group; their secret settings are
// outside this Caliber Pulse recovery set.
for(const resource of resources.filter(r=>r.type.toLowerCase()==='microsoft.web/sites'&&r.name===app)){
  const name=resource.name;const slots=az(['webapp','deployment','slot','list','-g',group,'-n',name],true)||[];
  for(const slot of [null,...slots.map(s=>s.name.split('/').pop())]){
    const scope=['-g',group,'-n',name,...(slot?['--slot',slot]:[])];
    snapshot.webapps.push({name,slot:slot||'production',configuration:az(['webapp','config','show',...scope],true),settings:az(['webapp','config','appsettings','list',...scope],true),connections:az(['webapp','config','connection-string','list',...scope],true),access:az(['webapp','config','access-restriction','show',...scope],true),authentication:az(['webapp','auth','show',...scope],true)});
  }
}
for(const resource of resources.filter(r=>r.type.toLowerCase()==='microsoft.dbforpostgresql/flexibleservers')){
  snapshot.postgres.push({server:az(['postgres','flexible-server','show','--ids',resource.id],true)||resource,parameters:az(['postgres','flexible-server','parameter','list','-g',group,'-s',resource.name],true),firewall:az(['postgres','flexible-server','firewall-rule','list','-g',group,'-n',resource.name],true),databases:az(['postgres','flexible-server','db','list','-g',group,'-s',resource.name],true)});
}
const pitr=snapshot.postgres.map(({server})=>({name:server.name,retentionDays:server.backup?.backupRetentionDays,earliestRestoreDate:server.backup?.earliestRestoreDate,geoRedundantBackup:server.backup?.geoRedundantBackup,state:server.state}));
const pitrVerified=pitr.length>0&&pitr.every(p=>p.retentionDays>=7&&p.earliestRestoreDate);
const summary={capturedAt:snapshot.capturedAt,complete:false,pitrVerified,resources:resources.length,pitr,errors,summary:`${resources.length} Azure resources; ${snapshot.webapps.length} application/slot configurations; ${pitr.length} PostgreSQL servers. ${errors.length} collection gaps. External dependencies require review.`};
await mkdir(path.join(output,'full-recovery'),{recursive:true});
const encrypted=path.join(output,'full-recovery','azure-hosting.enc');
await encryptStream(Readable.from([JSON.stringify(snapshot)]),encrypted,await readFile('recovery-public.pem','utf8'));
await writeFile(path.join(output,'full-recovery','azure-status.json'),JSON.stringify(summary,null,2));
// Matches the application's established large-body transport through Front Door.
const headers={'Content-Type':'text/plain','x-full-backup-key':serviceKey};
async function call(route,options={}){
  for(let attempt=0;attempt<4;attempt++){
    try{
      const response=await fetch(base+route,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(route.endsWith('/download')?1800000:60000)});
      if(response.ok)return response;
      if(![429,502,503,504].includes(response.status)||route.endsWith('/run')||attempt===3)throw Error('Backup service HTTP '+response.status);
    }catch(error){if(route.endsWith('/run')||attempt===3||/HTTP (?!429|502|503|504)/.test(error.message))throw error;}
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
}
let uploaded=false;
for(let i=0;i<30;i++){
  try{await call('/api/full-backup-system/snapshot',{method:'POST',body:JSON.stringify({archive:(await readFile(encrypted)).toString('base64'),summary})});uploaded=true;break;}
  catch{await new Promise(resolve=>setTimeout(resolve,10000));}
}
if(!uploaded)throw Error('Encrypted Azure inventory saved to workflow artifact, but upload to production failed.');
if(process.env.CREATE_FULL_BACKUP==='true'){
  const job=await (await call('/api/full-backup-system/run',{method:'POST',body:'{}'})).json();
  for(let i=0;i<120;i++){
    const status=await (await call('/api/full-backup-system/status')).json();
    if(status.id===job.id&&['Completed','Partial'].includes(status.status)){
      const {downloadRecoveryArchive}=await import('./download-recovery-archive.mjs');
      await downloadRecoveryArchive({url:base+`/api/full-backup-system/${job.id}/download`,headers,target:path.join(output,'full-recovery',status.fileName),checksum:status.checksum});
      console.log(JSON.stringify({summary,backup:{id:job.id,status:status.status,checksum:status.checksum,fileName:status.fileName}}));process.exit(0);
    }
    if(status.id===job.id&&status.status==='Failed')throw Error('Full backup failed; see Admin > Full Backup');
    await new Promise(resolve=>setTimeout(resolve,10000));
  }
  throw Error('Full backup did not finish within the collector timeout');
}
console.log(JSON.stringify(summary));
// Scheduled collection retains the latest application-scheduled bundle off-site
// without overriding the administrator's enabled/time/weekday settings.
const latest=await (await call('/api/full-backup-system/status')).json();
if(latest.id&&['Completed','Partial'].includes(latest.status)&&Date.now()-Date.parse(latest.startedAt)<26*3600000){
  const {downloadRecoveryArchive}=await import('./download-recovery-archive.mjs');
  await downloadRecoveryArchive({url:base+`/api/full-backup-system/${latest.id}/download`,headers,target:path.join(output,'full-recovery',latest.fileName),checksum:latest.checksum});
  console.log(JSON.stringify({copiedFullBackup:latest.id,status:latest.status,checksum:latest.checksum}));
}
