import test from 'node:test';
import assert from 'node:assert/strict';
import {createDeletionWhatsApp,deletionWhatsAppConfiguration,deletionWhatsAppConfigured,DELETION_PHONE} from '../deletion-sms.mjs';
import {hashPassword} from '../password-auth.mjs';

const saved={providerApiKey:'saved-secret',phoneNumberId:'111',businessAccountId:'222',graphVersion:'v25.0'};
const approved={name:'nerve_password_reset_otp',status:'APPROVED',category:'AUTHENTICATION',language:'en_US'};
const accepted={messaging_product:'whatsapp',messages:[{id:'wamid.fictional-message'}]};
const reply=body=>({ok:true,json:async()=>body});

test('reuses the saved WhatsApp setup without a Smart OTP ID and exposes no credentials in status',async()=>{
  const config=deletionWhatsAppConfiguration({FAST2SMS_WHATSAPP_API_KEY:'old-env-key',META_WHATSAPP_PHONE_NUMBER_ID:'999'},saved);
  assert.equal(config.apiKey,'saved-secret');assert.equal(config.phoneNumberId,'111');
  assert.equal(config.templateName,approved.name);assert.equal(deletionWhatsAppConfigured({},saved),true);
  const service=createDeletionWhatsApp({env:{},readSettings:async()=>saved});
  const status=await service.status();assert.equal(status.channel,'WhatsApp');assert.equal(status.configured,true);
  assert.equal(status.credentialSource,'saved Fast2SMS credential');assert.ok(!JSON.stringify(status).includes('saved-secret'));
  assert.equal('otpIdConfigured' in status,false);
});

test('explicit credentials and sender IDs work without database access; missing setup fails closed',async()=>{
  const service=createDeletionWhatsApp({env:{DELETION_FAST2SMS_API_KEY:'override',META_WHATSAPP_PHONE_NUMBER_ID:'111',META_WHATSAPP_BUSINESS_ACCOUNT_ID:'222'},readSettings:async()=>{throw Error('must not read');}});
  assert.equal(await service.configured(),true);
  assert.equal(deletionWhatsAppConfigured({FAST2SMS_WHATSAPP_API_KEY:'key'}),false);
  await assert.rejects(createDeletionWhatsApp({env:{}}).send(),/configure/);
});

test('checks authentication approval before sending and refuses utility, unapproved or wrong-language templates',async()=>{
  for(const template of [{...approved,status:'PENDING'},{...approved,category:'UTILITY'},{...approved,language:'hi'},{...approved,name:'other_template'}]){
    let sends=0;
    const service=createDeletionWhatsApp({env:{},readSettings:async()=>saved,fetchImpl:async(_url,options)=>{
      if(options.method==='POST')sends++;
      return reply({data:[template]});
    }});
    await assert.rejects(service.send(),/authentication template/);assert.equal(sends,0);
  }
});

test('sends body and copy-code button through Fast2SMS WhatsApp to the fixed owner only, without SMS fallback',async()=>{
  const calls=[];
  const service=createDeletionWhatsApp({env:{DELETION_FAST2SMS_OTP_ID:'ignored-sms-id',META_WHATSAPP_DELIVERY_PAUSED:'true'},readSettings:async()=>saved,
    fetchImpl:async(url,options)=>{calls.push({url,options});return reply(options.method==='GET'?{data:[approved]}:accepted);}});
  const delivery=await service.send();assert.equal(calls.length,2);
  assert.ok(calls[0].url.includes('/222/message_templates?name=nerve_password_reset_otp'));
  assert.equal(calls[1].url,'https://www.fast2sms.com/dev/whatsapp/v25.0/111/messages');
  const body=JSON.parse(calls[1].options.body),code=body.template.components[0].parameters[0].text;
  assert.equal(body.to,DELETION_PHONE.slice(1));assert.equal(body.messaging_product,'whatsapp');assert.equal(body.type,'template');
  assert.match(code,/^\d{6}$/);assert.equal(body.template.components[1].parameters[0].text,code);
  assert.equal(body.template.components[1].sub_type,'url');assert.equal(body.template.name,approved.name);
  assert.equal(calls[1].options.headers.Authorization,'saved-secret');
  assert.ok(!JSON.stringify(delivery).includes(`"${code}"`));assert.ok(!calls.some(call=>call.url.includes('/dev/otp/')));
  assert.equal(await service.check(delivery.id,code,delivery.otpHash),true);assert.equal(calls.length,2);
});

test('wrong codes, another approval hash and old SMS/Twilio delivery IDs cannot authorize deletion',async()=>{
  const service=createDeletionWhatsApp({env:{},fetchImpl:async()=>{throw Error('verification must be local');}});
  const hash=hashPassword('123456'),id='fast2sms-whatsapp:wamid.message';
  assert.equal(await service.check(id,'654321',hash),false);
  assert.equal(await service.check(id,'123456',hashPassword('654321')),false);
  assert.equal(await service.check(id,'123456',''),false);
  assert.equal(await service.check('fast2sms:old-sms-request','123456',hash),false);
  assert.equal(await service.check(`VE${'1'.repeat(32)}`,'123456',hash),false);
  assert.equal(await service.check(id,'123456',hash),true);
});

test('provider rejection, malformed success and network errors cannot authorize deletion or leak secrets',async()=>{
  for(const result of [{ok:false,status:401,json:async()=>({error:{message:'SECRET'}})},reply({error:{message:'SECRET'}}),
    reply({return:false,message:'SECRET'}),reply({messaging_product:'whatsapp',messages:[]}),
    reply({messaging_product:'sms',messages:[{id:'wamid.fake'}]}),reply(null)]){
    const service=createDeletionWhatsApp({env:{},readSettings:async()=>saved,fetchImpl:async(_url,options)=>options.method==='GET'?reply({data:[approved]}):result});
    await assert.rejects(service.send(),error=>error.status===503&&!error.message.includes('SECRET'));
  }
  const service=createDeletionWhatsApp({env:{},readSettings:async()=>saved,fetchImpl:async()=>{throw Error('SECRET');}});
  await assert.rejects(service.send(),error=>error.status===503&&!error.message.includes('SECRET'));
});
