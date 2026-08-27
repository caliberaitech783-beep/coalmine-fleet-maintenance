import test from 'node:test';
import assert from 'node:assert/strict';
import {META_WORKFLOW_TEMPLATES,metaWhatsAppConfiguration,normalizeWhatsAppRecipient,sendMetaWhatsAppTemplate,sendMetaWhatsAppText,submitMetaWhatsAppTemplates} from '../meta-whatsapp.mjs';

test('Meta WhatsApp configuration remains disabled until token and phone id are present',()=>{
  assert.equal(metaWhatsAppConfiguration({}).configured,false);
  assert.equal(metaWhatsAppConfiguration({META_WHATSAPP_ACCESS_TOKEN:'secret',META_WHATSAPP_PHONE_NUMBER_ID:'123'}).configured,true);
});

test('every workflow event has a Meta utility template',()=>{
  assert.deepEqual(Object.keys(META_WORKFLOW_TEMPLATES),['consolidatedRequestReport','consolidatedTicketReport','ticketCreated','ticketResolved','maintenanceReminder','dailyUpdate','requestOpened','requestIdle','requestClosed','requestOnRoad','requestVerified']);
  assert.ok(Object.values(META_WORKFLOW_TEMPLATES).every(({name,body,example})=>name.startsWith('nerve_')&&body&&example.length));
});

test('request lifecycle templates include complete operational details',()=>{
  assert.equal(META_WORKFLOW_TEMPLATES.requestOpened.name,'nerve_request_opened_details');
  assert.equal(META_WORKFLOW_TEMPLATES.requestOpened.example.length,6);
  assert.match(META_WORKFLOW_TEMPLATES.requestOpened.body,/Equipment \/ Vehicle Details:[\s\S]*Type of Breakdown:[\s\S]*Date & Time:[\s\S]*Location:[\s\S]*User:/);
  assert.equal(META_WORKFLOW_TEMPLATES.requestClosed.name,'nerve_request_closed_details');
  assert.equal(META_WORKFLOW_TEMPLATES.requestClosed.example.length,6);
  assert.match(META_WORKFLOW_TEMPLATES.requestClosed.body,/Equipment \/ Vehicle Details:[\s\S]*Type of Breakdown:[\s\S]*Closing Date & Time:[\s\S]*Maintenance Work Details:[\s\S]*Closed By:/);
});

test('Cloud API template delivery uses approved template parameters',async()=>{
  let request;
  const result=await sendMetaWhatsAppTemplate({to:'9420476281',templateKey:'ticketResolved',parameters:['TIC/1','Admin']},{
    env:{META_WHATSAPP_ACCESS_TOKEN:'secret',META_WHATSAPP_PHONE_NUMBER_ID:'123'},
    fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({messages:[{id:'wamid.template'}]})}},
  });
  assert.equal(result.template,'nerve_ticket_resolved');
  assert.equal(JSON.parse(request.options.body).type,'template');
  assert.deepEqual(JSON.parse(request.options.body).template.components[0].parameters,[{type:'text',text:'TIC/1'},{type:'text',text:'Admin'}]);
});

test('template submission creates missing utility templates and preserves existing ones',async()=>{
  const requests=[];
  const results=await submitMetaWhatsAppTemplates({
    env:{META_WHATSAPP_ACCESS_TOKEN:'secret',META_WHATSAPP_PHONE_NUMBER_ID:'123',META_WHATSAPP_BUSINESS_ACCOUNT_ID:'456'},
    fetchImpl:async(url,options={})=>{requests.push({url,options});if(options.method==='GET')return {ok:true,json:async()=>({data:[{id:'old',name:'nerve_ticket_created',status:'APPROVED',category:'UTILITY',language:'en_US'}]})};return {ok:true,json:async()=>({id:`new-${requests.length}`,status:'PENDING'})}},
  });
  assert.equal(results.length,11);
  assert.equal(results.find((result)=>result.name==='nerve_ticket_created').existing,true);
  assert.equal(requests.filter((request)=>request.options.method==='POST').length,10);
  assert.ok(requests.filter((request)=>request.options.method==='POST').every((request)=>JSON.parse(request.options.body).category==='UTILITY'));
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
