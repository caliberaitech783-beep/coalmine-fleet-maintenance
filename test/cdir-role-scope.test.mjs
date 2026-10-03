import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {cdirDirectoryForViewer,cdirViewerContext} from '../cdir-access.mjs';

const html=fs.readFileSync(new URL('../public/cd/caliber-directory.html',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');

const sites=[
  {id:'sasti-oc',label:'Sasti OC',dataKey:'SASTI',group:'WCL'},
  {id:'dhoptala-oc',label:'Dhoptala OC',dataKey:'DHOPTALA',group:'WCL'},
  {id:'dudhicua-west-oc',label:'Dudhicua West OC',dataKey:'DUDHICHUA WEST',group:'NCL'},
  {id:'dudhicua-east-oc',label:'Dudhicua East OC',dataKey:'DUDHICHUA EAST',group:'NCL'},
];

test('C-Dir gives Project Managers and General Users a site-scoped profile without exposing user master fields',()=>{
  const projectManager=cdirViewerContext({
    session:{role:'super',permissions:{adminLevel:'Manager',managerRoles:['Project Manager']}},
    user:{adminLevel:'Manager',managerRole:'Project Manager',managerRegion:'WCL',managerSites:'Sasti OC | Dhoptala OC (2nd)'},sites,
  });
  assert.deepEqual(projectManager,{profile:'project-manager',label:'Project Manager',allAccess:false,mySitesEnabled:true,
    siteIds:['sasti-oc','dhoptala-oc'],sites:['Sasti OC','Dhoptala OC'],regions:['WCL']});

  const general=cdirViewerContext({session:{role:'normal',assignedRole:'General User'},user:{userGroup:'General User',site:'Dudhichua OC | Dudhichua East OC'},sites});
  assert.deepEqual(general.siteIds,['dudhicua-west-oc','dudhicua-east-oc']);
  assert.equal(general.profile,'general-user');
  assert.equal('login' in general,false);
  assert.equal('permissions' in general,false);

  const mis=cdirViewerContext({session:{role:'normal',assignedRole:'MIS User'},user:{userGroup:'MIS User',site:'Sasti OC'},sites});
  assert.deepEqual(mis,{profile:'site-user',label:'MIS User',allAccess:false,mySitesEnabled:true,siteIds:['sasti-oc'],sites:['Sasti OC'],regions:['WCL']});
});

test('C-Dir gives global All only to Admin and removes out-of-scope rows from the API payload',()=>{
  const admin=cdirViewerContext({session:{role:'super',permissions:{adminLevel:'Admin'}},user:{adminLevel:'Admin'},sites});
  assert.equal(admin.allAccess,true);
  assert.deepEqual(admin.siteIds,sites.map(site=>site.id));
  const viewer=cdirViewerContext({session:{role:'normal',assignedRole:'MIS User'},user:{userGroup:'MIS User',site:'Sasti OC'},sites});
  const row={name:'Employee',department:'Operations',status:'ACTIVE'};
  const directory={meta:{generated:'today',totalStaffSanctioned:2,totalFilled:2,totalVacant:0,totalSitesOffices:2,totalDepartments:2},sites,categories:['A'],matrix:{'sasti-oc|A':[row],'dudhicua-east-oc|A':[{...row,name:'Hidden'}]},siteTotals:{'sasti-oc':1,'dudhicua-east-oc':1},siteStats:{'sasti-oc':{sanctioned:1,filled:1,vacant:0},'dudhicua-east-oc':{sanctioned:1,filled:1,vacant:0}},categoryTotalsUnique:{A:2}};
  const scoped=cdirDirectoryForViewer(directory,viewer);
  assert.deepEqual(scoped.sites,[sites[0]]);
  assert.deepEqual(Object.keys(scoped.matrix),['sasti-oc|A']);
  assert.equal(scoped.meta.totalStaffSanctioned,1);
  assert.equal(scoped.categoryTotalsUnique.A,1);
});

test('C-Dir region-first filters, All/My Sites tabs and Project Manager leaderboard are present',()=>{
  assert.match(html,/id="directoryScopeTabs"/);
  assert.match(html,/id="gfRegion"[\s\S]*?id="gfSite"[\s\S]*?id="gfDept"[\s\S]*?id="gfDesig"[\s\S]*?id="gfName"/);
  assert.match(html,/All[\s\S]*?My Site\(s\)/);
  assert.match(html,/Project Manager Site Coverage/);
  assert.match(client,/const canViewDirectory = true/);
  assert.match(client,/showDirectoryMenu=true/);
});

test('C-Dir expanded filters stay in document flow and use responsive grids',()=>{
  assert.match(html,/\.nav-dock\.open\{position:relative;top:auto;\}/);
  assert.match(html,/\.filter-row\.filter-strip\{[\s\S]*?display:grid;grid-template-columns:/);
  assert.match(html,/@media \(max-width:1180px\)\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html,/@media \(max-width:760px\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(html,/overflow-x:hidden/);
});

test('C-Dir is a native application page and does not render the legacy iframe',()=>{
  const component=fs.readFileSync(new URL('../src/caliber-directory-page.jsx',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../src/caliber-directory-page.css',import.meta.url),'utf8');
  assert.doesNotMatch(client,/src="\/cd\/caliber-directory\.html/);
  assert.doesNotMatch(component,/<iframe\b/);
  assert.match(client,/import CaliberDirectoryPage from "\.\/caliber-directory-page\.jsx"/);
  assert.match(client,/<CaliberDirectoryPage token=\{session\?\.token \|\| authToken\}/);
  assert.match(client,/className="cdir-module-tabs"[\s\S]*?<BookUser \/>Directory[\s\S]*?<Users \/>Employee Tenure Report/);
  assert.doesNotMatch(client,/<UsersRound \/>/);
  assert.match(component,/viewer\.allAccess\?'All regions':'All assigned regions'/);
  assert.match(component,/label:'My access'/);
  assert.match(component,/viewer\.allAccess\|\|viewer\.profile==='project-manager'/);
  assert.match(component,/Project Manager Site Coverage/);
  assert.match(component,/head office/);
  assert.match(component,/corporate office/);
  assert.match(component,/browseRegions=\['WCL','NCL'\]/);
  assert.match(component,/expandedBrowseRegion[\s\S]*?cdir-region-sites/);
  assert.match(component,/SITE_LEADERSHIP/);
  assert.match(component,/Site Overview/);
  assert.match(component,/Site leadership roster/);
  assert.match(css,/\.cdir-site-chips,\.cdir-category-chips\{flex-wrap:wrap;[\s\S]*?overflow:visible/);
  assert.match(css,/\.cdir-view-nav\{flex-wrap:wrap;[\s\S]*?overflow:visible/);
});
