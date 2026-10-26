// Run in the app's server environment to reuse its saved Fast2SMS key.
// Legacy filename retained: --send sends one WhatsApp authentication message.
// --check is read-only. No DLT or Smart OTP ID is needed.
// This script has no deletion endpoint and never modifies application records.
import pg from 'pg';
import {createDeletionWhatsApp} from '../deletion-sms.mjs';

const mode=process.argv[2] || '--check';
if(!['--check','--send'].includes(mode)){
  console.error('Usage: node scripts/test-deletion-sms.mjs [--check|--send]');process.exitCode=1;
}else{
  let pool;
  try{
    const sms=createDeletionWhatsApp({readSettings:async()=>{
      if(!process.env.DATABASE_URL)return {};
      pool ||= new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:10000,statement_timeout:5000});
      const {rows}=await pool.query('SELECT setting_value FROM app_settings WHERE setting_key=$1',['meta_whatsapp']);
      return rows[0]?.setting_value || {};
    }});
    const status=await sms.status();
    console.log(JSON.stringify({...status,mode:mode==='--check'?'configuration check (no WhatsApp sent)':'WhatsApp delivery test (no deletion)'},null,2));
    if(mode==='--send'){
      if(!status.configured)throw Error('Configure the existing Fast2SMS WhatsApp credential, sender and business account in the server environment first.');
      await sms.send();
      console.log('Fast2SMS accepted the test WhatsApp request. Confirm receipt on your phone. No deletion approval was created and no application data was changed.');
    }
  }catch(error){
    // Never print an underlying database/transport error that could reveal secrets.
    console.error(error?.status===503?error.message:'The test could not run. Check server access, the Fast2SMS WhatsApp credential, sender and approved authentication template.');
    process.exitCode=1;
  }finally{await pool?.end();}
}
