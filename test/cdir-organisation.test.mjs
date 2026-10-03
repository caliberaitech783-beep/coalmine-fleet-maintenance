import assert from 'node:assert/strict';
import test from 'node:test';
import {buildCdirOrganisation,cdirPersonId,mergeCdirReportingSuperiors} from '../cdir-organisation.mjs';

const row=(empId,name,reportingTo='',extra={})=>({empId,name,reportingTo,status:'ACTIVE',siteLabel:'Example site',...extra});

test('C-Directory fills only missing reporting lines from the User Master Superior field',()=>{
  const directory={matrix:{'site|A':[
    row('1','Director'),row('2','Manager','Director'),row('3','Supervisor'),
    {empId:'VACANT',name:null,status:'VACANT',reportingTo:''},
  ]}};
  const merged=mergeCdirReportingSuperiors(directory,[
    {employee:'Manager',superior:'Someone else'},
    {employee:'Supervisor',superior:'Manager'},
    {employee:'Vacancy',superior:'Director'},
  ]);
  assert.equal(merged.matrix['site|A'][1].reportingTo,'Director','C-Directory value wins');
  assert.equal(merged.matrix['site|A'][2].reportingTo,'Manager','User Master is the fallback');
  assert.equal(merged.matrix['site|A'][3].reportingTo,'','vacancies are not linked');
  assert.equal('login' in merged.matrix['site|A'][2],false,'account fields are not exposed');
});

test('C-Directory organisation model contains all descendants and exposes only people with teams as managers',()=>{
  const director=row('1','Director');
  const manager=row('2','Manager','Director');
  const supervisor=row('3','Supervisor','Manager');
  const employee=row('4','Employee','Supervisor');
  const model=buildCdirOrganisation([director,manager,supervisor,employee,row('5','Unlinked')]);
  assert.deepEqual(model.roots,[cdirPersonId(director)]);
  assert.deepEqual(model.descendantIds(cdirPersonId(director)),[
    cdirPersonId(manager),cdirPersonId(supervisor),cdirPersonId(employee),
  ]);
  assert.equal(model.managerIds.has(cdirPersonId(director)),true);
  assert.equal(model.managerIds.has(cdirPersonId(manager)),true);
  assert.equal(model.managerIds.has(cdirPersonId(supervisor)),true);
  assert.equal(model.managerIds.has(cdirPersonId(employee)),false);
});

test('organisation relationship matching accepts multi-value Superior entries and avoids cycles',()=>{
  const a=row('1','A','C');
  const b=row('2','B','Missing | A');
  const c=row('3','C','B');
  const model=buildCdirOrganisation([a,b,c]);
  assert.equal(model.parentById.get(cdirPersonId(b)),cdirPersonId(a));
  assert.ok(model.roots.length>0);
  assert.doesNotThrow(()=>model.descendantIds(model.roots[0]));
});
