import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  VEHICLE_TRANSFER_STATUS,
  applyAcceptedVehicleTransfer,
  transferMatchesEquipment,
  vehicleTransferProgress,
  vehicleTransferStatus,
  vehicleTransferValidationError,
} from '../vehicle-transfer-workflow.mjs';

test('vehicle transfer lifecycle exposes each accountable stage',()=>{
  const submitted={status:VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL,submittedBy:'MIS User'};
  assert.equal(vehicleTransferStatus(submitted),VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL);
  assert.deepEqual(vehicleTransferProgress(submitted).map((stage)=>stage.complete),[true,false,false,false]);
  const dispatched={...submitted,status:VEHICLE_TRANSFER_STATUS.MIS_VERIFICATION,sourceApprovedBy:'Source PM'};
  assert.deepEqual(vehicleTransferProgress(dispatched).map((stage)=>stage.complete),[true,true,false,false]);
  const verified={...dispatched,status:VEHICLE_TRANSFER_STATUS.DESTINATION_ACCEPTANCE,destinationMisVerifiedBy:'Destination MIS'};
  assert.deepEqual(vehicleTransferProgress(verified).map((stage)=>stage.complete),[true,true,true,false]);
  const accepted={...verified,status:VEHICLE_TRANSFER_STATUS.COMPLETED,destinationAcceptedBy:'Destination PM'};
  assert.deepEqual(vehicleTransferProgress(accepted).map((stage)=>stage.complete),[true,true,true,true]);
  assert.equal(vehicleTransferStatus({oracleSource:'EQUIPMENTTRANSFER'}),VEHICLE_TRANSFER_STATUS.COMPLETED);
  assert.equal(vehicleTransferStatus({transferNo:'LEGACY-1'}),VEHICLE_TRANSFER_STATUS.COMPLETED);
});

test('submission validation requires a real vehicle and a different destination',()=>{
  const valid={equipmentMasterId:12,transferDate:'2026-09-15',source:'Sasti OB',destination:'Majri OB'};
  assert.equal(vehicleTransferValidationError(valid),'');
  assert.match(vehicleTransferValidationError({...valid,equipmentMasterId:''}),/Select a vehicle/);
  assert.match(vehicleTransferValidationError({...valid,destination:'Sasti'}),/different/);
});

test('destination acceptance changes only the Vehicle Master location and transfer metadata',()=>{
  const equipment={id:12,door:'V-12',currentLocation:'Sasti OB',status:'Operational'};
  const transfer={equipmentMasterId:12,transferNo:'VT-12',transferDate:'2026-09-15',destination:'Majri OB'};
  assert.equal(transferMatchesEquipment(transfer,equipment),true);
  const updated=applyAcceptedVehicleTransfer(equipment,transfer,{acceptedAt:'2026-09-15T10:00:00Z',acceptedBy:'Destination PM'});
  assert.equal(updated.currentLocation,'Majri OB');
  assert.equal(updated.lastTransferNo,'VT-12');
  assert.equal(updated.status,'Operational');
  assert.equal(updated.lastTransferAcceptedBy,'Destination PM');
});

test('server and interface wire submission, both PM actions, audit, notifications and master update',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const client=readFileSync(new URL('../src/vehicle-transfer-workflow.jsx',import.meta.url),'utf8');
  assert.match(server,/app\.post\('\/api\/vehicle-transfers'/);
  assert.match(server,/source-approval/);
  assert.match(server,/destination-verification/);
  assert.match(server,/destination-acceptance/);
  assert.match(server,/action:'Submit vehicle transfer'/);
  assert.match(server,/action:'Approve vehicle dispatch'/);
  assert.match(server,/action:'Verify destination vehicle transfer'/);
  assert.match(server,/action:'Accept vehicle transfer'/);
  assert.match(server,/managerRoles\.includes\('Project Manager'\)/);
  assert.match(server,/master_name='Equipment master'/);
  assert.match(server,/Vehicle Master now shows/);
  assert.match(client,/Source approval pending/);
  assert.match(client,/Destination MIS verification/);
  assert.match(client,/Destination PM acceptance/);
  assert.match(client,/Vehicle Master updated/);
});

test('MIS navigation places Vehicle Transfer directly after Tickets',()=>{
  const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const normalHeader=client.match(/<nav className="normal-header-nav">[\s\S]*?<\/nav>/)?.[0]||'';
  assert.ok(normalHeader.indexOf('> Tickets</button>')<normalHeader.indexOf('> Vehicle Transfer</button>'));
  assert.match(client,/vehicleTransferDirectAccess&&<div className="nav-config-row">/);
  assert.match(client,/activeManagerRoles\.includes\("MIS Manager"\)/);
});
