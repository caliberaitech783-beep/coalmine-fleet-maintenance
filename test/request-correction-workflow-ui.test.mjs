import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [server,main,view]=await Promise.all([
  readFile(new URL('../server.mjs',import.meta.url),'utf8'),
  readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),
  readFile(new URL('../src/request-corrections.jsx',import.meta.url),'utf8'),
]);

test('server persists a manager-requested correction register with evidence, PM review, and Admin application',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS request_corrections/);
  assert.match(server,/evidence_data TEXT NOT NULL/);
  assert.match(server,/app\.post\('\/api\/request-corrections',requireSession/);
  assert.match(server,/Only a Production, Maintenance, or MIS Manager can request a correction/);
  assert.doesNotMatch(server,/Production users can request correction only for their own Off Road entry/,'the manager may correct any entry of their department within their sites');
  assert.match(server,/const allowedTypes=manager\?requestCorrectionTypesForManagerRoles\(managerRoles\):\[\];/,'operational users no longer request corrections');
  assert.match(server,/scope:pm\|\|requester\?managerReportScope\(user\):null/,'requests are limited to the manager\'s sites');
  assert.match(server,/You requested this correction, so another Project Manager of the site must review it/,'nobody approves their own correction');
  assert.match(server,/action:'Manager requested correction'/);
  assert.match(server,/allowedTypes:context\.allowedTypes/);
  assert.match(server,/Only the assigned site Project Manager can review this correction/);
  assert.match(server,/const pm=manager&&managerRoles\.includes\(CORRECTION_REVIEWER_ROLE\);/,'a Production Manager raises corrections but never reviews them');
  assert.match(server,/const CORRECTION_REVIEWER_ROLE='Project Manager';/);
  assert.match(server,/await correctionProjectManagerLogins\(pool,request\.site\)\)\.filter\(\(login\)=>login!==access\.login\)/,'a new request is forwarded directly to the site Project Manager');
  assert.match(server,/This correction is locked until the assigned PM approves it/);
  assert.match(server,/action:'Apply approved correction'/);
});

test('department manager, PM, and Admin receive their dedicated correction step',()=>{
  assert.match(main,/\["Request corrections", Pencil\]/);
  assert.match(main,/\{correctionRequestAccess && <div className="nav-config-row"><button className=\{active === "Request correction" \? "active" : ""\}/,'department managers get the Request correction menu');
  assert.match(main,/activeManagerRoles\.some\(\(role\)=>REQUEST_CORRECTION_MANAGER_ROLES\.includes\(role\)\)/);
  assert.match(main,/if\(name==="Request correction"\)return correctionRequestAccess;/);
  assert.match(main,/active === "Correction approvals" \|\| active === "Request correction" \? \(/);
  assert.doesNotMatch(main,/canRequestCorrection/,'Production, Maintenance and MIS users no longer have the menu');
  assert.doesNotMatch(main,/section==="corrections"/);
  assert.match(main,/Correction approvals/);
  assert.match(main,/const correctionApprovalAccess=permissions\.adminLevel==="Manager"&&activeManagerRoles\.includes\("Project Manager"\);/,'only the Project Manager sees Correction approvals');
  assert.match(main,/managerRole\)\r?\n\s+\.includes\('Project Manager'\);/);
  assert.match(main,/<RequestCorrections session=\{session\} requests=\{requests\} Dialog=\{Modal\}/);
});

test('correction screen explains and enforces the approval sequence',()=>{
  assert.match(view,/Request PM approval/);
  assert.match(view,/Department manager request/);
  assert.match(view,/The department manager requests with evidence/);
  assert.match(view,/Locked until PM approval/);
  assert.match(view,/Apply approved correction/);
  assert.match(view,/Upload correction evidence/);
  assert.match(view,/PM verification remark/);
  assert.match(view,/Search request, door, equipment, chassis, or site/);
  assert.match(view,/Search request, user, site, reason, or status/);
});

test('Breakdown type in the correction form is a dropdown from the Repair type master',async()=>{
  const {REQUEST_CORRECTION_TYPES}=await import('../request-correction-policy.mjs');
  const category=REQUEST_CORRECTION_TYPES.offRoad.fields.find((field)=>field.key==='category');
  assert.equal(category.optionsSource,'breakdownTypes');
  assert.equal(category.kind,'text','server normalisation of the value is unchanged');
  assert.match(server,/async function correctionBreakdownTypes\(client=pool\)/);
  assert.match(server,/WHERE master_name='Repair type master'/);
  assert.match(server,/fieldOptions:context\.requester\?\{breakdownTypes:await correctionBreakdownTypes\(\)\}:\{\}/,'sent with the page so managers without the Repair type master still get the list');
  assert.match(server,/Select a Breakdown type from the list\./,'a typed value outside the master is refused');
  assert.match(view,/if\(field\.optionsSource&&options\.length\)\{/);
  assert.match(view,/\[current,\.\.\.options\]:options/,'the recorded value stays selectable');
  assert.match(view,/options=\{fieldOptions\[field\.optionsSource\]\|\|\[\]\}/);
  assert.match(view,/fieldOptions=\{state\.fieldOptions\|\|\{\}\}/);
});
