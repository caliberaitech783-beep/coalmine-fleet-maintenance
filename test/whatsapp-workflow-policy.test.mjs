import test from 'node:test';
import assert from 'node:assert/strict';
import {isExcludedWorkflowWhatsAppRecipient,isWorkflowWhatsAppRecipient,WHATSAPP_WORKFLOW_DELIVERY_RULES,workflowReminderSlot,workflowRequestLink,workflowWhatsAppRecipientLogins} from '../whatsapp-workflow-policy.mjs';

const mobile=(login,role,site='Sasti OB')=>({login,userType:'Mobile User',assignedRole:role,site});
const manager=(login,roles,site='Sasti OB',extra={})=>({login,userType:'Super User',adminLevel:'Manager',managerRole:roles.join(' | '),site,...extra});

test('workbook event roles are site scoped',()=>{
  const users=[
    mobile('production','Production User'),mobile('maintenance','Maintenance User'),mobile('mis','MIS User'),
    mobile('other-site-maintenance','Maintenance User','Majri OB'),
    manager('production-manager',['Production Manager']),manager('maintenance-manager',['Maintenance Manager']),manager('mis-manager',['MIS Manager']),
    {...manager('project-manager',[]),adminLevel:'Project Manager',designation:'Project Manager'},
  ];
  assert.deepEqual(workflowWhatsAppRecipientLogins(users,{eventType:'opened',site:'Sasti OB'}),['maintenance','production-manager','maintenance-manager']);
  assert.deepEqual(workflowWhatsAppRecipientLogins(users,{eventType:'closed',site:'Sasti OB'}),['production','production-manager','maintenance-manager']);
  assert.deepEqual(workflowWhatsAppRecipientLogins(users,{eventType:'verified',site:'Sasti OB'}),['production-manager','maintenance-manager','mis-manager']);
  assert.deepEqual(workflowWhatsAppRecipientLogins(users,{eventType:'idle',site:'Sasti OB'}),['production-manager','maintenance-manager','mis-manager','project-manager']);
});

test('default rules exclude Directors, Admins and Super Admins from direct workflow WhatsApp messages',()=>{
  const excluded=[
    {login:'admin',userType:'Super User',adminLevel:'Admin',site:'Sasti OB'},
    {login:'super',userType:'Super User',adminLevel:'Super Admin',site:'Sasti OB'},
    {...manager('director',['Production Manager']),designation:'Director'},
    manager('named-director',['Production Manager'],'Sasti OB',{employee:'Mohit Chadda'}),
  ];
  for(const user of excluded){
    assert.equal(isExcludedWorkflowWhatsAppRecipient(user),true);
    for(const eventType of ['opened','closed','verified','idle'])assert.equal(isWorkflowWhatsAppRecipient(user,eventType,'Sasti OB'),false);
  }
  const duplicateLogin=[manager('shared',['Maintenance Manager']),{login:'shared',userType:'Super User',adminLevel:'Admin',site:'Sasti OB'}];
  assert.deepEqual(workflowWhatsAppRecipientLogins(duplicateLogin,{eventType:'opened',site:'Sasti OB'}),[]);
});

test('workbook delivery settings and request links are retained',()=>{
  assert.deepEqual(WHATSAPP_WORKFLOW_DELIVERY_RULES,{locationScoped:true,sendOutsideWorkingHours:true,offRoadEscalationHours:4,idleRepeatHours:1,includeRequestLink:true,auditEveryAttempt:false,trackMessageStatus:true,language:'English'});
  assert.equal(workflowRequestLink('REQ/123','https://bdms.cmll.in/'),'https://bdms.cmll.in/?request=REQ%2F123');
  const started=new Date('2026-09-06T00:00:00Z');
  assert.equal(workflowReminderSlot('opened',started,new Date('2026-09-06T03:59:59Z')),'');
  assert.equal(workflowReminderSlot('opened',started,new Date('2026-09-06T04:00:00Z')),'offroad-hour-4');
  assert.equal(workflowReminderSlot('idle',started,new Date('2026-09-06T01:05:00Z')),'idle-hour-1');
  assert.equal(workflowReminderSlot('idle',started,new Date('2026-09-06T02:05:00Z')),'idle-hour-2');
});
