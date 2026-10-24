// Deployment preflight. Runtime settings remain in memory; never print secrets.
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {TELEGRAM_SITES,normalizeTelegramSiteGroups,telegramUserHasSite} from '../telegram-site-groups.mjs';
import {telegramSiteGroupDetails} from '../telegram.mjs';

let pool;
try{
  const settings=JSON.parse(execFileSync('az',['webapp','config','appsettings','list','-g',process.env.AZURE_RESOURCE_GROUP||'coalmine-fleet-maintenance-rg','-n',process.env.AZURE_WEBAPP_NAME||'coalmine-fleet-azure-783','--only-show-errors','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const env=Object.fromEntries(settings.map(item=>[item.name,item.value]));
  if(!env.DATABASE_URL||!env.TELEGRAM_BOT_TOKEN)throw Error('configuration');
  pool=new pg.Pool({connectionString:env.DATABASE_URL,ssl:env.DATABASE_SSL==='false'?false:{rejectUnauthorized:false},connectionTimeoutMillis:10000,max:1});
  const {rows}=await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='telegram_site_groups'");
  const groups=normalizeTelegramSiteGroups(rows[0]?.setting_value);
  let ready=true;
  for(const site of TELEGRAM_SITES){
    const group=groups.find(group=>group.site===site);
    let botReady=false;
    if(group)try{await telegramSiteGroupDetails(group.chatId,{env});botReady=true;}catch{}
    console.log(JSON.stringify({site,registered:Boolean(group),botReady}));
    if(!botReady)ready=false;
  }
  const {rows:users}=await pool.query("SELECT record_data FROM master_records WHERE master_name='Users & employees' AND trim(COALESCE(record_data->>'login',''))<>''");
  console.log(JSON.stringify({accounts:users.length,siteAllocationRequired:users.filter(({record_data:user})=>!TELEGRAM_SITES.some(site=>telegramUserHasSite(user,site))).length}));
  if(!ready){console.error('Membership deployment stopped: register all eight site groups and grant the bot administrator and invitation permissions.');process.exitCode=1;}
}catch{
  console.error('Membership deployment preflight could not verify production configuration. No runtime secrets were logged.');
  process.exitCode=1;
}finally{await pool?.end();}
