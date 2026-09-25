import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import * as policy from '../whatsapp-report-settings.mjs';
import * as templates from '../whatsapp-template-catalog.mjs';

const source=readFileSync(new URL('../src/whatsapp-report-settings.jsx',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const {code}=await transformWithOxc(source.replace(/^import .*;\r?\n/gm,'').replace(/export default /g,'').replace(/export function /g,'function '),'whatsapp-delivery-settings.jsx',{jsx:{runtime:'classic'}});
const descendants=(node,predicate)=>Array.isArray(node)?node.flatMap(item=>descendants(item,predicate)):React.isValidElement(node)?[...(predicate(node)?[node]:[]),...descendants(node.props.children,predicate)]:[];

function harness({settings=policy.defaultWhatsAppReportSettings(),section='delivery',onOpenReportSchedules}={}) {
  const details={settings:structuredClone(settings),revision:'2026-09-15T00:00:00.000Z'};
  const slots=[details,structuredClone(settings),section,'requestOpened',''];
  let cursor=0;
  const requests=[],closed=[];
  const bindings={React,...policy,...templates,document:{body:{}},createPortal:child=>child,useEffect(){},
    useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];},
    useRef(initial){const index=cursor++;if(!(index in slots))slots[index]={current:initial};return slots[index];},
    readApiJson:async response=>response,
    fetch:async(url,init)=>{requests.push({url,...init});return {...details,settings:JSON.parse(init.body).settings};},
    ...Object.fromEntries(['Bell','Check','Clock','FileText','MessageSquare','Plus','RefreshCw','Save','Settings2','ShieldCheck','X'].map(name=>[name,()=>null])),
  };
  const api=new Function(...Object.keys(bindings),`${code};return {WhatsAppReportSettingsDialog,resetWhatsAppDeliveryRules};`)(...Object.values(bindings));
  return {
    render(){cursor=0;return api.WhatsAppReportSettingsDialog({token:'fixture',onClose:()=>closed.push(true),onOpenReportSchedules});},
    button(label){const matches=descendants(this.render(),node=>node.type==='button'&&renderToStaticMarkup(node).includes(label));assert.ok(matches.length,`Missing button: ${label}`);return matches[0];},
    requests,closed,reset:api.resetWhatsAppDeliveryRules,
  };
}

test('delivery overview has an accessible policy matrix and explains scope and report windows',()=>{
  const app=harness({onOpenReportSchedules(){}}),tree=app.render(),html=renderToStaticMarkup(tree);
  const dialog=descendants(tree,node=>node.props.role==='dialog')[0];
  assert.equal(dialog.props['aria-labelledby'],'wrs-title');
  assert.match(html,/<h2 id="wrs-title">WhatsApp delivery settings<\/h2>/);
  assert.match(html,/<caption>Default role delivery rules<\/caption>/);
  assert.match(html,/Managers and Directors<\/th><td>Never per-request<\/td>/);
  assert.match(html,/Admin and Super Admin<\/th><td>Never per-request<\/td>/);
  assert.match(html,/CRM users receive alerts for their own tickets/);
  assert.match(html,/Hierarchy report assignments and site access still apply/);
  assert.match(html,/7 PM → 7 AM/);
  assert.match(html,/separate PDF and Excel files/);
  assert.equal(descendants(tree,node=>node.type==='input'&&node.props.type==='time').length,0,'The overview must link to the existing schedule editor');
});

test('schedule links pass their target to the integration callback',()=>{
  const targets=[],app=harness({onOpenReportSchedules:target=>targets.push(target)});
  app.button('Role default schedules').props.onClick();
  app.button('My report schedule').props.onClick();
  assert.deepEqual(targets,['role-defaults','personal']);
  assert.deepEqual(app.requests,[],'Navigation must not save or reset the timetable');
});

test('schedule navigation protects unsaved rules and opens only after explicit discard',()=>{
  const settings=policy.defaultWhatsAppReportSettings();settings.enabled=false;
  const targets=[],app=harness({settings,onOpenReportSchedules:target=>targets.push(target)});
  app.button('Reset delivery rules').props.onClick();
  app.button('My report schedule').props.onClick();
  assert.deepEqual(targets,[]);
  assert.match(renderToStaticMarkup(app.render()),/unsaved delivery changes/);
  app.button('Keep editing').props.onClick();
  assert.deepEqual(targets,[]);
  app.button('Role default schedules').props.onClick();
  app.button('Discard changes and open schedule').props.onClick();
  assert.deepEqual(targets,['role-defaults']);
  assert.deepEqual(app.closed,[],'The dashboard close handler must not override schedule navigation');
  assert.deepEqual(app.requests,[]);
});

test('reset delivery rules preserves draft CRM days and times and custom templates when saved',async()=>{
  const settings=policy.defaultWhatsAppReportSettings();
  settings.enabled=false;settings.crm.days=[1,3,5];settings.crm.times=['07:00','19:00'];
  settings.channels.dailyUpdate=false;settings.templates.requestOpened.variant='brief';
  const original=structuredClone(settings),app=harness({settings,section:'crm'});
  const reset=app.reset(settings);
  assert.deepEqual(settings,original,'Reset must not mutate the original settings');
  assert.deepEqual(reset.crm.days,[1,3,5]);
  assert.deepEqual(reset.crm.times,['07:00','19:00']);
  assert.deepEqual(reset.templates,original.templates);
  assert.deepEqual(reset.events,policy.defaultWhatsAppReportSettings().events);
  assert.deepEqual(reset.channels,policy.defaultWhatsAppReportSettings().channels);
  const time=descendants(app.render(),node=>node.type==='input'&&node.props['aria-label']==='CRM fallback delivery time 1')[0];
  time.props.onChange({target:{value:'06:30'}});
  app.button('Reset delivery rules').props.onClick();
  assert.match(renderToStaticMarkup(app.render()),/Keep saved timetables/);
  await app.button('Save settings').props.onClick();
  assert.equal(app.requests.length,1);
  const saved=JSON.parse(app.requests[0].body).settings;
  assert.deepEqual(saved.crm.days,[1,3,5]);
  assert.deepEqual(saved.crm.times,['06:30','19:00'],'Keep even unsaved timetable edits');
  assert.deepEqual(saved.templates,original.templates);
  assert.equal(saved.enabled,true);
});

test('CRM timetable is clearly an organisation fallback and retains day and time choices',()=>{
  const app=harness({section:'crm',onOpenReportSchedules(){}}),tree=app.render(),html=renderToStaticMarkup(tree);
  assert.match(html,/Organisation CRM fallback timetable/);
  assert.match(html,/same timing preferences for fleet and CRM reports/);
  assert.match(html,/overrides this fallback/);
  assert.match(html,/Fallback delivery days/);
  assert.match(html,/CRM fallback delivery time 1/);
  assert.doesNotMatch(html,/Your CRM delivery timetable/);
  assert.equal(descendants(tree,node=>node.type==='input'&&node.props.type==='time').length,policy.defaultWhatsAppReportSettings().crm.times.length);
});

test('request alert role choices use the policy options and do not imply managers receive CRM alerts',()=>{
  const app=harness({section:'alerts'}),tree=app.render(),html=renderToStaticMarkup(tree);
  assert.match(html,/never per-request alerts or reminders/);
  for(const role of policy.WORKFLOW_ROLE_OPTIONS)assert.ok(html.includes(role.label),role.label);
  const delivery=renderToStaticMarkup(harness().render());
  assert.match(delivery,/Notify the ticket creator within existing CRM access/);
  assert.doesNotMatch(delivery,/assigned managers|event report bundles/);
});

test('report schedule UI keeps timed options and clearly separates shared defaults from personal schedules',()=>{
  const schedules=main.slice(main.indexOf('{directorTimingOpen && createPortal('),main.indexOf('{reportZipOpen && createPortal('));
  assert.match(schedules,/Role default report schedules/);
  assert.match(schedules,/My report schedule/);
  for(const cadence of ['daily','weekly','interval'])assert.ok(schedules.includes(`value="${cadence}"`));
  assert.doesNotMatch(schedules,/value="event"|Every event|schedule\.cadence !== "event"/);
  assert.match(schedules,/Report delivery time/);
  assert.match(schedules,/7 PM → 7 AM/);
  assert.match(schedules,/one PDF and one Excel file/);
  assert.match(schedules,/Hierarchy report assignments and site access still apply/);
  assert.match(schedules,/Without a saved personal schedule, CRM keeps its organisation fallback days and times/);
});

test('changing frequency clears unused cadence fields while keeping selected times and reports',async()=>{
  const field=main.match(/<label><span>Frequency<\/span><select[\s\S]*?<\/select><\/label>/)[0];
  const {code:fieldCode}=await transformWithOxc(`function Frequency(schedule,updateReportSchedule){return (${field});}`,'schedule-frequency.jsx',{jsx:{runtime:'classic'}});
  const Frequency=new Function('React',`${fieldCode};return Frequency;`)(React);
  let schedule={key:'personal',cadence:'interval',weekday:4,intervalDays:5,times:['07:00','19:00'],reports:['Fleet report']};
  const choose=cadence=>{
    const tree=Frequency(schedule,(_key,changes)=>{schedule={...schedule,...changes};});
    descendants(tree,node=>node.type==='select')[0].props.onChange({target:{value:cadence}});
  };
  choose('daily');
  assert.equal(schedule.weekday,null);assert.equal(schedule.intervalDays,null);
  choose('weekly');
  assert.equal(schedule.weekday,1);assert.equal(schedule.intervalDays,null);
  choose('interval');
  assert.equal(schedule.weekday,null);assert.equal(schedule.intervalDays,7);
  assert.deepEqual(schedule.times,['07:00','19:00']);
  assert.deepEqual(schedule.reports,['Fleet report']);
  assert.match(main,/cadence: "daily", weekday: null, intervalDays: null/);
});

test('admin personal saves use the personal API scope and shared saves keep the organisation endpoint',async()=>{
  const loadSource=main.slice(main.indexOf('  const loadReportScheduleDetails ='),main.indexOf('  useEffect(() => {',main.indexOf('  const loadReportScheduleDetails =')));
  const saveSource=main.slice(main.indexOf('  const saveReportSchedules ='),main.indexOf('  const resetUserReportSchedule ='));
  for(const scope of ['personal','organisation']){
    const requests=[],applied=[],roleSettings={designations:{director:{enabled:true,schedules:[]}}},personal={enabled:true,schedules:[{key:'mine',times:['07:00','19:00']} ]};
    const bindings={reportScheduleScope:scope,reportScheduleSaving:false,reportScheduleLoading:false,reportScheduleError:'',session:{token:'admin-fixture'},
      reportAccess:{canManageAll:scope==='organisation'},reportScheduleSettings:roleSettings,userReportSchedule:personal,
      setReportScheduleSaving(){},setDirectorTimingOpen(){},applyReportScheduleDetails:value=>applied.push(value),alert:message=>assert.fail(message),
      fetch:async(url,init)=>{requests.push({url,...init});return {ok:true,json:async()=>({canManageAll:scope==='organisation'})};},
    };
    const api=new Function(...Object.keys(bindings),`${loadSource}\n${saveSource}\nreturn {loadReportScheduleDetails,saveReportSchedules};`)(...Object.values(bindings));
    await api.loadReportScheduleDetails(scope);
    await api.saveReportSchedules();
    assert.deepEqual(requests.map(request=>request.url),Array(2).fill(`/api/report-schedule-settings${scope==='personal'?'?scope=personal':''}`));
    assert.deepEqual(JSON.parse(requests[1].body),scope==='personal'?{userSchedule:personal}:roleSettings);
    assert.equal(applied.length,2);
  }
});

test('a failed schedule load cannot save the previous editor contents under a different scope',async()=>{
  const saveSource=main.slice(main.indexOf('  const saveReportSchedules ='),main.indexOf('  const resetUserReportSchedule ='));
  const save=new Function('reportScheduleSaving','reportScheduleLoading','reportScheduleError',`${saveSource};return saveReportSchedules;`)(false,false,'Could not load personal schedule.');
  await save();
});

test('existing operational headers retain Reports and General User follows its menu selection',async()=>{
  const start=main.indexOf('<nav className="normal-header-nav">'),end=main.indexOf('</nav>',start)+6;
  const {code:navCode}=await transformWithOxc(`function MobileNav(){return (${main.slice(start,end)});}`,'mobile-reports-preview.jsx',{jsx:{runtime:'classic'}});
  for(const [mobileRole,showReportsMenu] of [['Production User',true],['Maintenance User',true],['MIS User',true],['OEM User',true],['General User',false],['General User',true]]){
    const sections=[],scope={React,mobileRole,isGeneral:mobileRole==='General User',isMis:mobileRole==='MIS User',canRequestCorrection:['Production User','Maintenance User','MIS User'].includes(mobileRole),section:'dashboard',showDashboardMenu:true,showDirectoryMenu:false,showReportsMenu,showRequestsMenu:false,showTicketsMenu:false,setSection:next=>sections.push(next),
      ...Object.fromEntries(['LayoutDashboard','BookOpen','Wrench','Pencil','FileBarChart','Ticket','ArrowRightLeft'].map(name=>[name,()=>null]))};
    const Nav=new Function(...Object.keys(scope),`${navCode};return MobileNav;`)(...Object.values(scope));
    const tree=Nav(),buttons=descendants(tree,node=>node.type==='button');
    const reports=buttons.find(button=>renderToStaticMarkup(button).includes('Reports'));
    assert.equal(Boolean(reports),showReportsMenu,mobileRole);
    if(reports){reports.props.onClick();assert.deepEqual(sections,['reports']);}
    const correction=buttons.find(button=>renderToStaticMarkup(button).includes('Request correction'));
    assert.equal(Boolean(correction),false,`${mobileRole}: Request correction moved to the department manager`);
  }
  assert.match(main,/!embedded&&section==="reports"&&showReportsMenu&&<ReportsPage/);
});

test('admin, manager, director and operational profiles retain a Reports navigation destination',()=>{
  const source=main.slice(main.indexOf('function reportCategoryIdsForUser('),main.indexOf('function firstTripTimestamp('));
  const reportCategoryTabs=['general','production','maintenance','mis'].map(id=>({id}));
  const categories=new Function('reportCategoryTabs',`${source};return reportCategoryIdsForUser;`)(reportCategoryTabs);
  for(const [permissions,session] of [
    [{adminLevel:'Admin',mobileTabAccess:[],mobileReportAccess:[]},{role:'super'}],
    [{adminLevel:'Super Admin',mobileTabAccess:[],mobileReportAccess:[]},{role:'super'}],
    [{adminLevel:'Manager',managerRole:'Production Manager'},{role:'super'}],
    [{adminLevel:'Admin'},{role:'super',designation:'Director'}],
    [{department:'Maintenance User'},{role:'normal'}],
    [{department:'MIS User'},{role:'normal'}],
    [{department:'OEM User'},{role:'normal'}],
  ])assert.ok(categories(permissions,session).includes('general'));
  assert.match(main,/const canViewReports = visibleReportNav\.length > 0/);
  assert.match(main,/if \(name === "Reports"\) return reportCategoryIdsForUser\(activeNavigationPermissions, session\)\.length > 0/);
  const actions=main.slice(main.indexOf('<div className="reports-header-actions">'),main.indexOf('{directorTimingOpen && createPortal('));
  assert.match(actions,/onClick=\{\(\) => openReportSchedules\("personal"\)\}[^>]*><Clock \/> My report schedule/);
});

test('effective organisation timings returned by GET are preserved for every role on save',async()=>{
  const settings={designations:{
    director:{enabled:true,allRecipients:true,recipientLogins:[],schedules:[{key:'legacy-director',enabled:true,cadence:'weekly',weekday:3,intervalDays:null,times:['06:35','19:15'],reports:['Opening Report']}]},
    maintenanceManager:{enabled:false,allRecipients:true,recipientLogins:[],schedules:[{key:'legacy-maintenance',enabled:false,cadence:'interval',weekday:null,intervalDays:5,times:['10:45'],reports:['Closing Report']}]},
  }};
  const original=structuredClone(settings);
  const applySource=main.slice(main.indexOf('  const applyReportScheduleDetails ='),main.indexOf('  const loadReportScheduleDetails ='));
  const saveSource=main.slice(main.indexOf('  const saveReportSchedules ='),main.indexOf('  const resetUserReportSchedule ='));
  let loaded;
  const applyBindings={session:{name:'Fixture'},setReportScheduleSettings:value=>{loaded=value;},setReportScheduleRecipients(){},setReportAccess(){},setReportScheduleOwner(){},setSelectedScheduleDesignation(){},setReportAccessLoaded(){}};
  const apply=new Function(...Object.keys(applyBindings),`${applySource};return applyReportScheduleDetails;`)(...Object.values(applyBindings));
  apply({settings,canManageAll:true,allowedDesignationKeys:Object.keys(settings.designations),allowedReports:['Opening Report','Closing Report']});
  assert.deepEqual(loaded,original);
  let saved;
  const saveBindings={reportScheduleSaving:false,reportScheduleLoading:false,reportScheduleError:'',reportScheduleScope:'organisation',reportAccess:{canManageAll:true},reportScheduleSettings:loaded,session:{token:'fixture'},setReportScheduleSaving(){},setDirectorTimingOpen(){},applyReportScheduleDetails(){},alert:message=>assert.fail(message),
    fetch:async(_url,init)=>{saved=JSON.parse(init.body);return {ok:true,json:async()=>({})};}};
  const save=new Function(...Object.keys(saveBindings),`${saveSource};return saveReportSchedules;`)(...Object.values(saveBindings));
  await save();assert.deepEqual(saved,original);assert.deepEqual(settings,original);
});

test('schedule explanations remain accessible in a collapsed disclosure above the timetable',()=>{
  assert.match(main,/<details className="wrs-schedule-context"><summary>Timing defaults, report windows and site access<\/summary>/);
  assert.doesNotMatch(main,/<details className="wrs-schedule-context" open/);
});
