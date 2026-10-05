import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const start=source.indexOf("    }else if(status==='Running BD'){");
const branch=source.slice(start+"    }else if(status==='Running BD'){".length,source.indexOf("    }else if(status==='Closed'){",start));
async function notify(failLookup=false){
  const calls=[],errors=[];
  const row={ref:'REQ-BD',site:'Sasti OB',requesterLogin:'production',maintenanceWork:'Awaiting replacement part'};
  await runInNewContext(`(async()=>{${branch}})()`,{
    pool:{},rows:[row],closedAt:new Date('2026-10-05T11:24:08Z'),req:{session:{name:'Maintenance User'}},
    requestStakeholderLogins:async()=>{if(failLookup)throw Error('Directory unavailable');return ['mis','production'];},
    requestWorkflowWhatsAppLogins:async(_pool,options)=>{calls.push({routing:options});return ['mis'];},
    requestEquipmentNotificationDetails:()=> 'Door D1',requestNotificationTime:()=> '05 Oct 2026 16:54',
    workflowRequestLink:ref=>`https://bdms.cmll.in/?request=${ref}`,publicBaseUrl:()=> 'https://bdms.cmll.in',
    addTicketNotificationsBestEffort:async(...args)=>calls.push({args}),console:{error:(...args)=>errors.push(args)},
  });
  return {calls,errors};
}
test('Running BD alerts MIS through the scoped on-road audience without declaring closure',async()=>{
  const {calls}=await notify();
  assert.equal(calls[0].routing.eventType,'closed');assert.equal(calls[0].routing.site,'Sasti OB');
  const [,recipients,reference,message,template,options]=calls[1].args;
  assert.ok(recipients.includes('mis'));assert.equal(reference,'REQ-BD');
  assert.match(message,/Running BD/);assert.match(message,/MIS verification is required/);
  assert.match(message,/ticket remains open until all issues are fixed/);assert.match(message,/Awaiting replacement part/);
  assert.match(message,/https:\/\/bdms.cmll.in\/\?request=REQ-BD/);
  assert.equal(template,null);assert.equal(options.whatsapp,true);
  assert.ok(options.whatsappRecipients.includes('mis'));assert.equal(options.workflowType,'closed');assert.equal(options.site,'Sasti OB');
});
test('recipient lookup failure cannot turn a saved Running BD handoff into a server error',async()=>{
  const {calls,errors}=await notify(true);assert.equal(calls.length,0);assert.equal(errors.length,1);
});
