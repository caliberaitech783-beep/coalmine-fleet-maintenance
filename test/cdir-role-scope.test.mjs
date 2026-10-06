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
  assert.deepEqual(projectManager,{profile:'project-manager',label:'Project Manager',allAccess:true,mySitesEnabled:false,
    siteIds:['sasti-oc','dhoptala-oc'],sites:['Sasti OC','Dhoptala OC'],regions:['WCL']});

  const general=cdirViewerContext({session:{role:'normal',assignedRole:'General User'},user:{userGroup:'General User',site:'Dudhichua OC | Dudhichua East OC'},sites});
  assert.deepEqual(general.siteIds,['dudhicua-west-oc','dudhicua-east-oc']);
  assert.equal(general.profile,'general-user');
  assert.equal('login' in general,false);
  assert.equal('permissions' in general,false);

  const mis=cdirViewerContext({session:{role:'normal',assignedRole:'MIS User'},user:{userGroup:'MIS User',site:'Sasti OC'},sites});
  assert.deepEqual(mis,{profile:'site-user',label:'MIS User',allAccess:true,mySitesEnabled:false,siteIds:['sasti-oc'],sites:['Sasti OC'],regions:['WCL']});
});

test('C-Dir gives every role global All and preserves all API rows and totals',()=>{
  const admin=cdirViewerContext({session:{role:'super',permissions:{adminLevel:'Admin'}},user:{adminLevel:'Admin'},sites});
  assert.equal(admin.allAccess,true);
  assert.deepEqual(admin.siteIds,sites.map(site=>site.id));
  const viewer=cdirViewerContext({session:{role:'normal',assignedRole:'MIS User'},user:{userGroup:'MIS User',site:'Sasti OC'},sites});
  const row={name:'Employee',department:'Operations',status:'ACTIVE'};
  const directory={meta:{generated:'today',totalStaffSanctioned:2,totalFilled:2,totalVacant:0,totalSitesOffices:2,totalDepartments:2},sites,categories:['A'],matrix:{'sasti-oc|A':[row],'dudhicua-east-oc|A':[{...row,name:'Hidden'}]},siteTotals:{'sasti-oc':1,'dudhicua-east-oc':1},siteStats:{'sasti-oc':{sanctioned:1,filled:1,vacant:0},'dudhicua-east-oc':{sanctioned:1,filled:1,vacant:0}},categoryTotalsUnique:{A:2}};
  const scoped=cdirDirectoryForViewer(directory,viewer);
  assert.equal(scoped,directory);
  assert.deepEqual(scoped.sites,sites);
  assert.deepEqual(Object.keys(scoped.matrix),['sasti-oc|A','dudhicua-east-oc|A']);
  assert.equal(scoped.meta.totalStaffSanctioned,2);
  assert.equal(scoped.categoryTotalsUnique.A,2);
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
  assert.match(component,/viewer\.allAccess\|\|viewer\.profile==='project-manager'/);
  assert.match(component,/Project Manager Site Coverage/);
  assert.match(component,/head office/);
  assert.match(component,/corporate office/);
  assert.match(component,/browseRegions=\['WCL','NCL'\]/);
  assert.match(component,/accessRegions=\['WCL','NCL'\]/);
  assert.match(component,/headOffice[\s\S]*?corporateOffice[\s\S]*?accessRegions\.map/);
  assert.match(component,/primaryScopeOptions[\s\S]*?regionalSiteOptions/);
  assert.match(component,/regionalSiteOptions\.map/);
  assert.match(component,/const categoryBaseRows=useMemo/);
  assert.match(component,/const browseCountRows=[\s\S]*?filteredRows/);
  assert.match(component,/const categoryCountRows=[\s\S]*?categoryBaseRows/);
  assert.match(component,/browseCountRows\.filter\(row=>row\.siteId===browseHeadOffice\.id\)/);
  assert.match(component,/categoryCountRows\.filter\(row=>row\.cat===category\)/);
  assert.match(component,/if\(key==='region'\)setScope/);
  assert.match(component,/if\(key==='site'\)setScope/);
  assert.match(component,/onClick=\{\(\)=>selectScope\(option\)\}/);
  assert.match(component,/browseTo[\s\S]*?setScope/);
  assert.match(component,/browseTo\(ALL,browseHeadOffice\.id\)/);
  assert.match(component,/browseTo\(ALL,browseCorporateOffice\.id\)/);
  assert.match(component,/openFiltered[\s\S]*?targetSite[\s\S]*?setScope\(`site:\$\{targetSite\.id\}`\)/);
  assert.match(component,/expandedBrowseRegion[\s\S]*?cdir-region-sites/);
  assert.match(component,/SITE_LEADERSHIP/);
  assert.match(component,/Site Overview/);
  assert.match(component,/Site leadership roster/);
  assert.match(component,/id="cdir-directory-views"/);
  assert.match(component,/showAllPeople=\(\)=>\{resetFilters\(\);setView\('people'\)/);
  assert.match(component,/Show all people/);
  assert.match(component,/cdir-show-all[\s\S]*?Show all people[\s\S]*?ProjectManagerLeaderboard/);
  assert.match(component,/const employeeRows=useMemo\(\(\)=>filteredRows\.filter\(activePerson\)/);
  assert.match(component,/view==='people'[\s\S]*?DirectoryTable rows=\{employeeRows\}/);
  assert.match(component,/view==='vacancies'[\s\S]*?DirectoryTable rows=\{vacancies\}/);
  assert.match(component,/onOrganisation=\{openOrganisation\}[\s\S]*?organisationManagers=\{organisation\.managerIds\}/);
  assert.match(component,/const organisationScope=useMemo\(\(\)=>buildCdirOrganisation\(siteRows\)/);
  assert.match(component,/const organisationFilterActive=filters\.department!==ALL[\s\S]*?filters\.name/);
  assert.match(component,/employeeRows\.map\(cdirPersonId\)\.filter\(id=>organisationScope\.managerIds\.has\(id\)\)/);
  assert.match(component,/candidates\.has\(parentId\)\)return false/);
  assert.match(component,/model=\{organisationRoot\?organisation:organisationScope\}/);
  assert.match(component,/rootIds=\{organisationRoot\?undefined:organisationFilterRoots\}/);
  assert.match(component,/filtered=\{!organisationRoot&&\(organisationFilterActive\|\|organisationGeographyFiltered\)\}/);
  assert.match(component,/rootPerson=\{organisationRoot\}[\s\S]*?onShowAll=\{\(\)=>setOrganisationRoot\(null\)\}/);
  assert.match(component,/exportRows\(currentExportRows\)/);
  assert.match(css,/\.cdir-site-chips,\.cdir-category-chips\{flex-wrap:wrap;[\s\S]*?overflow:visible/);
  assert.match(css,/\.cdir-view-nav\{flex-wrap:wrap;[\s\S]*?overflow:visible/);
  assert.match(css,/\.cdir-scope-sites>div\{flex-wrap:wrap/);
  assert.match(css,/\.cdir-show-all\{display:flex;justify-content:flex-end/);
  assert.match(css,/\.cdir-show-all button\{[\s\S]*?border:0;background:transparent/);
});

test('office, General User, manager and unassigned accounts can view every directory location',()=>{
  for(const location of ['Corporate Office, Nagpur','Head Office, Chandrapur','Sasti OC','']){
    for(const role of ['General User','MIS User','Maintenance User','Production User']){
      const viewer=cdirViewerContext({session:{role:'normal',assignedRole:role},user:{location},sites});
      assert.equal(viewer.allAccess,true);
      assert.equal(viewer.mySitesEnabled,false);
      const directory={sites,matrix:{'sasti-oc|A':[{name:'WCL employee'}],'dudhicua-east-oc|A':[{name:'NCL employee'}]}};
      assert.equal(cdirDirectoryForViewer(directory,viewer),directory);
    }
  }
  const component=fs.readFileSync(new URL('../src/caliber-directory-page.jsx',import.meta.url),'utf8');
  assert.match(component,/rootScopeKey='all'/);
  assert.doesNotMatch(component,/My access/);
});
