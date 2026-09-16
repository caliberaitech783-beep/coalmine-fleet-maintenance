import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REQUEST_CORRECTION_STATUS,
  normalizeRequestCorrectionChanges,
  requestCorrectionSnapshot,
  requestCorrectionTimelineFields,
  requestCorrectionTypesForRole,
  requestCorrectionValidationError,
  validCorrectionEvidence,
} from '../request-correction-policy.mjs';

const tinyPng='data:image/png;base64,iVBORw0KGgo=';

test('correction workflow has explicit approval states',()=>{
  assert.deepEqual(Object.values(REQUEST_CORRECTION_STATUS),['Pending PM approval','Approved','Rejected','Applied']);
});

test('each operational user can request correction only for their own workflow stage',()=>{
  assert.deepEqual(requestCorrectionTypesForRole('Production User'),['offRoad']);
  assert.deepEqual(requestCorrectionTypesForRole('Maintenance User'),['maintenanceAcceptance','onRoad']);
  assert.deepEqual(requestCorrectionTypesForRole('MIS User'),['misVerification']);
  assert.deepEqual(requestCorrectionTypesForRole('Admin'),[]);
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

test('timeline events are derived from approved changed fields',()=>{
  assert.deepEqual(requestCorrectionTimelineFields('misVerification',{verifiedAt:'2026-09-15T05:00:00.000Z',verifiedBy:'MIS',closingMeterReading:'10'}),['verifiedAt']);
});
