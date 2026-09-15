import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  VEHICLE_TRANSFER_STATUS,
  VEHICLE_TRANSFER_VIEW,
  applyAcceptedVehicleTransfer,
  transferMatchesEquipment,
  vehicleTransferProgress,
  vehicleTransferStatus,
  vehicleTransferValidationError,
  vehicleTransferViewRecords,
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

test('Project Manager tabs separate release and acceptance work queues',()=>{
  const records=[
    {id:1,canApproveSource:true,canAcceptDestination:false},
    {id:2,canApproveSource:false,canAcceptDestination:true},
    {id:3,canApproveSource:false,canAcceptDestination:false},
  ];
  assert.deepEqual(vehicleTransferViewRecords(records,VEHICLE_TRANSFER_VIEW.ALL).map(({id})=>id),[1,2,3]);
  assert.deepEqual(vehicleTransferViewRecords(records,VEHICLE_TRANSFER_VIEW.RELEASE).map(({id})=>id),[1]);
  assert.deepEqual(vehicleTransferViewRecords(records,VEHICLE_TRANSFER_VIEW.ACCEPT).map(({id})=>id),[2]);
});

test('server and interface wire submission, both PM actions, audit, notifications and master update',()=>{
  const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const client=readFileSync(new URL('../src/vehicle-transfer-workflow.jsx',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../src/vehicle-transfer-workflow.css',import.meta.url),'utf8');
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
  assert.match(client,/Project Manager vehicle transfer work queues/);
  assert.match(client,/Release Vehicle/);
  assert.match(client,/Accept Vehicle/);
  assert.match(client,/Release vehicle/);
  assert.match(client,/Vehicle Master updated/);
  assert.match(styles,/\.vehicle-transfer-tabs\{/);
  assert.match(styles,/\.modal\.vehicle-transfer-form-modal\{width:min\(980px/);
  assert.match(styles,/\.vehicle-transfer-form \.formgrid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles,/\.vehicle-transfer-form \.formgrid>label\{display:grid/);
  assert.match(styles,/\.vehicle-transfer-form :is\(input,select,textarea\)\{display:block;width:100%/);
  assert.match(styles,/\.vehicle-transfer-form \.full\{grid-column:1\/-1\}/);
  assert.match(styles,/@media\(max-width:700px\)[\s\S]*\.vehicle-transfer-form \.formgrid\{grid-template-columns:minmax\(0,1fr\)/);
});

test('MIS navigation places Vehicle Transfer directly after Tickets',()=>{
  const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  const normalHeader=client.match(/<nav className="normal-header-nav">[\s\S]*?<\/nav>/)?.[0]||'';
  assert.ok(normalHeader.indexOf('> Tickets</button>')<normalHeader.indexOf('> Vehicle Transfer</button>'));
  assert.match(client,/vehicleTransferDirectAccess&&<div className="nav-config-row">/);
  assert.match(client,/activeManagerRoles\.includes\("MIS Manager"\)/);
});
