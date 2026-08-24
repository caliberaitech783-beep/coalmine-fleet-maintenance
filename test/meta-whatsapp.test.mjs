import test from 'node:test';
import assert from 'node:assert/strict';
import {metaWhatsAppConfiguration,normalizeWhatsAppRecipient,sendMetaWhatsAppText} from '../meta-whatsapp.mjs';

test('Meta WhatsApp configuration remains disabled until token and phone id are present',()=>{
  assert.equal(metaWhatsAppConfiguration({}).configured,false);
  assert.equal(metaWhatsAppConfiguration({META_WHATSAPP_ACCESS_TOKEN:'secret',META_WHATSAPP_PHONE_NUMBER_ID:'123'}).configured,true);
});

test('Indian WhatsApp recipients are normalized for Cloud API delivery',()=>{
  assert.equal(normalizeWhatsAppRecipient('94204 76281'),'919420476281');
  assert.equal(normalizeWhatsAppRecipient('+91 94204 76281'),'919420476281');
});

test('Cloud API text delivery uses the configured phone number without exposing the token',async()=>{
  let request;
  const result=await sendMetaWhatsAppText({to:'9420476281',message:'Daily report'},
    {env:{META_WHATSAPP_ACCESS_TOKEN:'top-secret',META_WHATSAPP_PHONE_NUMBER_ID:'1183',META_GRAPH_VERSION:'v25.0'},
      fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({messages:[{id:'wamid.1'}]})}}});
  assert.equal(result.messageId,'wamid.1');
  assert.equal(request.url,'https://graph.facebook.com/v25.0/1183/messages');
  assert.equal(request.options.headers.Authorization,'Bearer top-secret');
  assert.deepEqual(JSON.parse(request.options.body),{messaging_product:'whatsapp',recipient_type:'individual',to:'919420476281',type:'text',text:{preview_url:false,body:'Daily report'}});
});
