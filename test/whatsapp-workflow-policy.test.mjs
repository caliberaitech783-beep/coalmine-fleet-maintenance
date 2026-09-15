import test from 'node:test';
import assert from 'node:assert/strict';
import {isExcludedWorkflowWhatsAppRecipient,isWorkflowWhatsAppRecipient,isWhatsAppAllAlertRecipient,isWhatsAppReportsOnlyRecipient,whatsAppRecipientRole,WHATSAPP_WORKFLOW_DELIVERY_RULES,workflowReminderSlot,workflowRequestLink,workflowWhatsAppRecipientLogins} from '../whatsapp-workflow-policy.mjs';
import {defaultWhatsAppReportSettings,normalizeWhatsAppReportSettings} from '../whatsapp-report-settings.mjs';
import {resolveMobileAccess} from '../mobile-access.mjs';
import {managerReportScope,reportScopeIncludesSite} from '../region-scope.mjs';

const mobile=(login,role,site='Sasti OB')=>({login,userType:'Mobile User',assignedRole:role,site});
const manager=(login,roles,site='Sasti OB',extra={})=>({login,userType:'Super User',adminLevel:'Manager',managerRole:roles.join(' | '),site,...extra});

const eventTypes=['opened','closed','verified','idle'];
const admin=(login,adminLevel='Admin',extra={})=>({login,userType:'Super User',adminLevel,...extra});

test('all operational users and supervisors receive all four alerts at their assigned site by default',()=>{
  const users=[
    mobile('production','Production User'),mobile('maintenance','Maintenance User'),mobile('mis','MIS User'),
    mobile('production-supervisor','Production Supervisor'),mobile('maintenance-supervisor','Maintenance Supervisor'),mobile('mis-supervisor','MIS Supervisor'),
    mobile('other-site-maintenance','Maintenance User','Majri OB'),
    manager('production-manager',['Production Manager']),manager('maintenance-manager',['Maintenance Manager']),manager('mis-manager',['MIS Manager']),
    {...manager('project-manager',[]),adminLevel:'Project Manager',designation:'Project Manager'},
  ];
  for(const settings of [null,defaultWhatsAppReportSettings()])for(const eventType of eventTypes){
    assert.deepEqual(workflowWhatsAppRecipientLogins(users,{eventType,site:'Sasti OB',settings}),[
      'production','maintenance','mis','production-supervisor','maintenance-supervisor','mis-supervisor',
    ],eventType);
  }
});

test('all managers and Directors stay reports-only even with legacy role selections or multiple roles',()=>{
  const excluded=[
    manager('production',['Production Manager']),manager('maintenance',['Maintenance Manager']),manager('mis',['MIS Manager']),
    manager('project',['Project Manager']),manager('generic',[]),
    manager('multi-role',['Production Manager','Maintenance Manager','MIS Manager']),
    manager('project-multi-role',['Project Manager','Maintenance Manager']),
    {...mobile('mixed-mobile','Production User'),designation:'Maintenance Manager'},
    {...mobile('supervisor-manager','Production Supervisor'),managerRole:['MIS Manager']},
    {login:'legacy-project',userType:'Super User',adminLevel:'Project Manager'},
    admin('admin-manager','Admin',{designation:'Production Manager'}),
    admin('admin-project','Admin',{managerRole:'Project Manager'}),
    {login:'implicit-admin-manager',userType:'Super User',designation:'Maintenance Manager'},
    admin('other-manager','Admin',{designation:'General Manager'}),
    {...manager('director',['Production Manager']),designation:'Director'},
    admin('admin-director','Admin',{designation:'Director'}),
    ...['Mohit Chadda','Manish Chadda','Rahul Chadda'].map(employee=>admin(employee,'Admin',{employee})),
  ];
  const legacy=defaultWhatsAppReportSettings();delete legacy.deliveryPolicyVersion;
  for(const event of Object.values(legacy.events))event.recipientRoles.push('productionManager','maintenanceManager','misManager','projectManager','director');
  for(const user of excluded){
    const snapshot=structuredClone(user);
    for(const profile of [undefined,resolveMobileAccess({user})]){
      assert.equal(isWhatsAppReportsOnlyRecipient(user,profile),true,user.login);
      assert.equal(isWhatsAppAllAlertRecipient(user,profile),false,user.login);
      assert.equal(isExcludedWorkflowWhatsAppRecipient(user,profile),true,user.login);
    }
    for(const settings of [null,legacy,normalizeWhatsAppReportSettings(legacy)])for(const eventType of eventTypes){
      assert.equal(isWorkflowWhatsAppRecipient(user,eventType,'Sasti OB',settings),false,`${user.login}/${eventType}`);
    }
    assert.deepEqual(user,snapshot);
  }
});

test('Admin and true Super Admin receive every alert globally, with Super Admin overriding job titles',()=>{
  const recipients=[admin('admin'),{login:'implicit-admin',userType:'Super User'},admin('super','Super Admin'),
    admin('assigned-admin','Admin',{site:'Majri OB',managerSites:'Majri OB',managerRegion:'WCL'}),
    admin('director-super',' Super   Admin ',{designation:'Director',employee:'Mohit Chadda',managerRole:'Project Manager',site:'Majri OB'}),
    admin('manager-super','Super Admin',{designation:'Maintenance Manager',managerSites:'Sasti OB'}),
  ];
  for(const user of recipients){
    assert.equal(isWhatsAppAllAlertRecipient(user),true,user.login);
    assert.equal(isWhatsAppReportsOnlyRecipient(user),false,user.login);
    assert.equal(isExcludedWorkflowWhatsAppRecipient(user),false,user.login);
    for(const settings of [null,defaultWhatsAppReportSettings()])for(const eventType of eventTypes)for(const site of ['Sasti OB','Jayant OB','Unlisted site','']){
      assert.equal(isWorkflowWhatsAppRecipient(user,eventType,site,settings),true,`${user.login}/${eventType}/${site}`);
    }
  }
  assert.equal(whatsAppRecipientRole(admin('director','Admin',{designation:'Director'})),'director');
  assert.equal(whatsAppRecipientRole(admin('director','Super Admin',{designation:'Director'})),'superAdmin');
  assert.equal(whatsAppRecipientRole(admin('admin')),'admin');
  assert.equal(whatsAppRecipientRole(manager('manager',[])),'manager');
  assert.equal(whatsAppRecipientRole(mobile('mobile','Production User')),'');
});

test('mobile alerts require an exact canonical assigned site even when manager scope fields are present',()=>{
  const user={...mobile('mobile','Maintenance User'),managerRegion:'All',managerSites:'Sasti OB | Majri OB',currentLocation:'Majri OB'};
  for(const eventType of eventTypes){
    assert.equal(isWorkflowWhatsAppRecipient(user,eventType,'SASTI II'),true);
    for(const site of ['Majri OB','Jayant OB',''])assert.equal(isWorkflowWhatsAppRecipient(user,eventType,site),false);
    assert.equal(isWorkflowWhatsAppRecipient({...user,site:'',currentLocation:''},eventType,'Sasti OB'),false);
    assert.equal(isWorkflowWhatsAppRecipient({...user,site:' ',location:'Sasti OB'},eventType,'Sasti OB'),true);
    assert.equal(isWorkflowWhatsAppRecipient({...user,site:'',location:'',currentLocation:'Majri OB'},eventType,'Majri OB'),true);
  }
  const scopedManager=manager('manager',['Production Manager'],'Sasti OB',{managerSites:'Majri OB',managerRegion:'All'});
  const scope=managerReportScope(scopedManager);
  assert.equal(isWhatsAppReportsOnlyRecipient(scopedManager),true);
  assert.deepEqual(managerReportScope(scopedManager),scope);
  assert.equal(reportScopeIncludesSite(scope,'Majri OB'),true);
  assert.equal(reportScopeIncludesSite(scope,'Sasti OB'),false);
  assert.equal(reportScopeIncludesSite(managerReportScope(manager('unassigned',[],'')),'Sasti OB'),false);
});

test('a reports-only duplicate login blocks mobile or admin rows regardless of order and casing',()=>{
  const rows=[
    {record_data:mobile(' SHARED ','Production User')},
    {record_data:manager('shared',['Maintenance Manager'])},
    admin('director-shared'),admin(' DIRECTOR-SHARED ','Admin',{designation:'Director'}),
    mobile('unique','MIS User'),mobile(' UNIQUE ','MIS User'),
    {login:'',userType:'Super User',adminLevel:'Manager'},null,
  ];
  for(const settings of [null,defaultWhatsAppReportSettings()])for(const eventType of eventTypes){
    assert.deepEqual(workflowWhatsAppRecipientLogins(rows,{eventType,site:'Sasti OB',settings}),['unique']);
    assert.deepEqual(workflowWhatsAppRecipientLogins([...rows].reverse(),{eventType,site:'Sasti OB',settings}),['unique']);
  }
});

test('saved alert selections and pauses apply to Admins without falling back to their mobile or job role',()=>{
  const settings=defaultWhatsAppReportSettings();
  const user={...mobile('admin','Production User'),adminLevel:'Admin'};
  settings.events.opened.recipientRoles=['productionSupervisor'];
  assert.equal(isWorkflowWhatsAppRecipient(user,'opened','Sasti OB',settings),false);
  assert.deepEqual(workflowWhatsAppRecipientLogins([mobile('ADMIN','Production User'),user],{eventType:'opened',site:'Sasti OB',settings}),[]);
  settings.events.opened.recipientRoles=['admin'];
  assert.equal(isWorkflowWhatsAppRecipient(user,'opened','Majri OB',settings),true);
  settings.events.opened.enabled=false;
  assert.equal(isWorkflowWhatsAppRecipient(user,'opened','Majri OB',settings),false);
  settings.events.opened.enabled=true;settings.enabled=false;
  assert.equal(isWorkflowWhatsAppRecipient(user,'opened','Majri OB',settings),false);
  assert.equal(isWorkflowWhatsAppRecipient(user,'unknown','Majri OB'),false);
  assert.equal(isWorkflowWhatsAppRecipient(user,'unknown','Majri OB',settings),false);
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
