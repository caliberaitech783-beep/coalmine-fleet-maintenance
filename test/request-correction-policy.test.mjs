import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUEST_CORRECTION_STATUS,
  normalizeRequestCorrectionChanges,
  requestCorrectionSnapshot,
  requestCorrectionReviewRemarkError,
  requestCorrectionTimelineFields,
  requestCorrectionTypesForManagerRoles,
  requestCorrectionTypesForRole,
  REQUEST_CORRECTION_MANAGER_ROLES,
  requestCorrectionValidationError,
  validCorrectionEvidence,
} from '../request-correction-policy.mjs';

const tinyPng='data:image/png;base64,iVBORw0KGgo=';

test('correction workflow has explicit approval states',()=>{
  assert.deepEqual(Object.values(REQUEST_CORRECTION_STATUS),['Pending PM approval','Approved','Rejected','Applied','Deleted']);
});

test('each department manager requests corrections only for their own department stage; operational users cannot',()=>{
  assert.deepEqual(requestCorrectionTypesForRole('Production Manager'),['offRoad']);
  assert.deepEqual(requestCorrectionTypesForRole('Maintenance Manager'),['maintenanceAcceptance','onRoad']);
  assert.deepEqual(requestCorrectionTypesForRole('MIS Manager'),['misVerification']);
  for(const role of ['Production User','Maintenance User','MIS User','Project Manager','Admin',''])assert.deepEqual(requestCorrectionTypesForRole(role),[],role);
  assert.deepEqual(REQUEST_CORRECTION_MANAGER_ROLES,['Production Manager','Maintenance Manager','MIS Manager']);
  assert.deepEqual(requestCorrectionTypesForManagerRoles(['MIS Manager','Maintenance Manager']),['maintenanceAcceptance','onRoad','misVerification'],'a manager with two roles gets both departments, in workflow order');
  assert.deepEqual(requestCorrectionTypesForManagerRoles(['Project Manager']),[]);
  assert.deepEqual(requestCorrectionTypesForManagerRoles('Production Manager'),['offRoad']);
  assert.deepEqual(requestCorrectionTypesForManagerRoles(),[]);
});

test('correction snapshots expose only the selected lifecycle fields',()=>{
  const snapshot=requestCorrectionSnapshot({startedAt:new Date('2026-09-15T04:30:00.000Z'),complaint:'Tyre issue',site:'Sasti OB'},'offRoad');
  assert.equal(snapshot.startedAt,'2026-09-15T04:30:00.000Z');
  assert.equal(snapshot.complaint,'Tyre issue');
  assert.equal('site' in snapshot,false);
});

test('normalization keeps only changed, allow-listed values',()=>{
  const changes=normalizeRequestCorrectionChanges('maintenanceAcceptance',{
    acceptedAt:'2026-09-15T10:00:00+05:30',acceptedBy:'Correct Person',unexpected:'blocked',
  },{acceptedAt:'2026-09-15T03:30:00.000Z',acceptedBy:'Wrong Person',expectedCompletionAt:''});
  assert.deepEqual(changes,{acceptedAt:'2026-09-15T04:30:00.000Z',acceptedBy:'Correct Person'});
  assert.equal('unexpected' in changes,false);
});

test('an optional missing historical value does not block a different correction',()=>{
  assert.deepEqual(normalizeRequestCorrectionChanges('maintenanceAcceptance',{
    acceptedAt:'2026-09-15T10:00:00+05:30',acceptedBy:'Correct Person',expectedCompletionAt:'',
  },{acceptedAt:'2026-09-15T04:30:00.000Z',acceptedBy:'Wrong Person',expectedCompletionAt:''}),{acceptedBy:'Correct Person'});
});

test('unchanged corrections are rejected',()=>{
  assert.throws(()=>normalizeRequestCorrectionChanges('onRoad',{maintenanceWork:'Repaired'},{maintenanceWork:'Repaired'}),/Change at least one field/);
});

test('reason and image evidence are mandatory',()=>{
  assert.equal(validCorrectionEvidence(tinyPng),true);
  assert.match(requestCorrectionValidationError({type:'offRoad',reason:'short',evidenceData:tinyPng,evidenceName:'proof.png',proposedChanges:{complaint:'Correct'},originalValues:{complaint:'Wrong'}}),/between 10 and 1,000/);
  assert.match(requestCorrectionValidationError({type:'offRoad',reason:'Correcting the recorded complaint',evidenceData:'',evidenceName:'proof.png',proposedChanges:{complaint:'Correct'},originalValues:{complaint:'Wrong'}}),/Upload a JPG/);
  assert.equal(requestCorrectionValidationError({type:'offRoad',reason:'Correcting the recorded complaint',evidenceData:tinyPng,evidenceName:'proof.png',proposedChanges:{complaint:'Correct'},originalValues:{complaint:'Wrong'}}),'');
});

test('PM review remarks give the same validation result in the screen and API',()=>{
  assert.match(requestCorrectionReviewRemarkError(''),/between 5 and 1,000/);
  assert.match(requestCorrectionReviewRemarkError(' no '),/between 5 and 1,000/);
  assert.equal(requestCorrectionReviewRemarkError('valid'),'');
  assert.match(requestCorrectionReviewRemarkError('x'.repeat(1001)),/between 5 and 1,000/);
});

test('timeline events are derived from approved changed fields',()=>{
  assert.deepEqual(requestCorrectionTimelineFields('misVerification',{verifiedAt:'2026-09-15T05:00:00.000Z',verifiedBy:'MIS',closingMeterReading:'10'}),['verifiedAt']);
});
