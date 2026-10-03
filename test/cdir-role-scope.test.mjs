import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {cdirViewerContext} from '../cdir-access.mjs';

const html=fs.readFileSync(new URL('../public/cd/caliber-directory.html',import.meta.url),'utf8');
const client=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const themeClient=fs.readFileSync(new URL('../public/cd/directory-theme.js',import.meta.url),'utf8');
const topbarCss=fs.readFileSync(new URL('../src/topbar.css',import.meta.url),'utf8');

const sites=[
  {id:'sasti-oc',label:'Sasti OC',dataKey:'SASTI'},
  {id:'dhoptala-oc',label:'Dhoptala OC',dataKey:'DHOPTALA'},
  {id:'dudhicua-west-oc',label:'Dudhicua West OC',dataKey:'DUDHICHUA WEST'},
  {id:'dudhicua-east-oc',label:'Dudhicua East OC',dataKey:'DUDHICHUA EAST'},
];

test('C-Dir gives Project Managers and General Users a site-scoped profile without exposing user master fields',()=>{
  const projectManager=cdirViewerContext({
    session:{role:'super',permissions:{adminLevel:'Manager',managerRoles:['Project Manager']}},
    user:{adminLevel:'Manager',managerRole:'Project Manager',managerRegion:'WCL',managerSites:'Sasti OC | Dhoptala OC (2nd)'},sites,
  });
  assert.deepEqual(projectManager,{profile:'project-manager',label:'Project Manager',mySitesEnabled:true,
    siteIds:['sasti-oc','dhoptala-oc'],sites:['Sasti OC','Dhoptala OC (2nd)']});

  const general=cdirViewerContext({session:{role:'normal',assignedRole:'General User'},user:{userGroup:'General User',site:'Dudhichua OC | Dudhichua East OC'},sites});
  assert.deepEqual(general.siteIds,['dudhicua-west-oc','dudhicua-east-oc']);
  assert.equal(general.profile,'general-user');
  assert.equal('login' in general,false);
  assert.equal('permissions' in general,false);
});

test('C-Dir region-first filters, All/My Sites tabs and Project Manager leaderboard are present',()=>{
  assert.match(html,/id="directoryScopeTabs"/);
  assert.match(html,/id="gfRegion"[\s\S]*?id="gfSite"[\s\S]*?id="gfDept"[\s\S]*?id="gfDesig"[\s\S]*?id="gfName"/);
  assert.match(html,/All[\s\S]*?My Site\(s\)/);
  assert.match(html,/Project Manager Site Coverage/);
  assert.match(client,/activeManagerRoles\.includes\("Project Manager"\) \|\| accessAllows\(viewPermissions\.tabAccess, "CD"\)/);
});

test('C-Dir expanded filters stay in document flow and use responsive grids',()=>{
  assert.match(html,/\.nav-dock\.open\{position:relative;top:auto;\}/);
  assert.match(html,/\.filter-row\.filter-strip\{[\s\S]*?display:grid;grid-template-columns:/);
  assert.match(html,/@media \(max-width:1180px\)\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(html,/@media \(max-width:760px\)\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(html,/overflow-x:hidden/);
});

test('C-Dir uses native embedded chrome and delegates scrolling to BDMS',()=>{
  assert.match(client,/src="\/cd\/caliber-directory\.html\?embedded=1"/);
  assert.match(client,/event\.data\?\.type !== "cdir:resize"/);
  assert.match(client,/scrolling="no"/);
  assert.match(themeClient,/root\.dataset\.embedded = embedded \? 'true' : 'false'/);
  assert.match(themeClient,/postMessage\(\{ type: 'cdir:resize', height \}/);
  assert.match(html,/html\[data-embedded="true"\] \.tb-logo,[\s\S]*?\.tb-clock\{display:none;\}/);
  assert.match(html,/html\[data-embedded="true"\] \.hero-band\{[\s\S]*?width:100%/);
  assert.match(topbarCss,/\.caliber-directory-page \{[\s\S]*?border: 0;[\s\S]*?box-shadow: none;/);
});
