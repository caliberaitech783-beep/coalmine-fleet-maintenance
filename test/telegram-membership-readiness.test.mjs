import test from 'node:test';
import assert from 'node:assert/strict';
import {registerTelegramMembershipReadiness} from '../telegram-membership-readiness.mjs';
import {TELEGRAM_SITES} from '../telegram-site-groups.mjs';

function probe(options){
  let handler;
  registerTelegramMembershipReadiness({get:(_path,value)=>{handler=value;}},options);
  return async(deployment='commit')=>{
    const result={};
    await handler({query:{deployment}},{sendStatus:code=>{result.status=code;},set(){},json:value=>{result.body=value;}},error=>{throw error;});
    return result;
  };
}
test('readiness probe is unavailable in production and requires the exact staging commit',async()=>{
  const options={scheduledJobsEnabled:true,commit:'commit',groups:async()=>{throw Error('Do not access configuration');},checkGroup:async()=>{}};
  assert.equal((await probe(options)()).status,404);
  assert.equal((await probe({...options,scheduledJobsEnabled:false})('wrong')).status,404);
});
test('staging checks all eight groups and never returns chat ids, links or identities',async()=>{
  let calls=0;
  const check=probe({scheduledJobsEnabled:false,commit:'commit',groups:async()=>TELEGRAM_SITES.map((site,index)=>({site,chatId:String(-index-1),inviteLink:'private-link'})),checkGroup:async()=>{calls++;}});
  const result=(await check()).body;
  assert.equal(result.ready,true);assert.equal(calls,8);
  assert.deepEqual(Object.keys(result.sites[0]),['site','registered','botReady']);
  await check();assert.equal(calls,8);
});
test('missing group mappings or lost bot permissions prevent production swap',async()=>{
  const check=probe({scheduledJobsEnabled:false,commit:'commit',groups:async()=>[{site:'Sasti OC',chatId:'-1'}],checkGroup:async()=>{throw Error('Bot not administrator');}});
  const result=(await check()).body;
  assert.equal(result.ready,false);assert.equal(result.sites.length,8);
  assert.equal(result.sites.find(site=>site.site==='Sasti OC').botReady,false);
  assert.equal(result.sites.find(site=>site.site==='Majri OC').registered,false);
});
