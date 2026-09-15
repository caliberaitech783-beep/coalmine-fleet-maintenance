import {canonicalSiteName} from './site-location.mjs';

export const VEHICLE_TRANSFER_STATUS = Object.freeze({
  SOURCE_APPROVAL: 'Awaiting source approval',
  MIS_VERIFICATION: 'Awaiting destination MIS verification',
  DESTINATION_ACCEPTANCE: 'Awaiting destination PM acceptance',
  COMPLETED: 'Completed',
});

export const VEHICLE_TRANSFER_VIEW = Object.freeze({
  ALL: 'all',
  RELEASE: 'release',
  ACCEPT: 'accept',
});

export function vehicleTransferStatus(record = {}) {
  const value = String(record.status || '').trim();
  if (Object.values(VEHICLE_TRANSFER_STATUS).includes(value)) return value;
  // Records created before this controlled workflow are historical transfers.
  // Never reopen them for a PM action merely because they have no workflow status.
  return VEHICLE_TRANSFER_STATUS.COMPLETED;
}

export function vehicleTransferValidationError(record = {}) {
  const source = canonicalSiteName(record.source);
  const destination = canonicalSiteName(record.destination);
  if (!record.equipmentMasterId) return 'Select a vehicle or equipment from the Vehicle Master.';
  if (!record.transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(String(record.transferDate))) return 'Select a valid transfer date.';
  if (!source) return 'The vehicle must have a current source location in the Vehicle Master.';
  if (!destination) return 'Select the destination site.';
  if (source === destination) return 'The destination site must be different from the current site.';
  return '';
}

export function transferMatchesEquipment(transfer = {}, equipment = {}) {
  if (String(transfer.equipmentMasterId || '') && String(transfer.equipmentMasterId) === String(equipment.id || '')) return true;
  const normalized = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const transferKeys = [transfer.chassisNo, transfer.manufacturerSerialNo, transfer.equipment, transfer.door, transfer.reg]
    .map(normalized).filter(Boolean);
  const equipmentKeys = [equipment.chassisNo, equipment.manufacturerSerialNo, equipment.equipmentName, equipment.door, equipment.reg, equipment.asset]
    .map(normalized).filter(Boolean);
  return transferKeys.some((key) => equipmentKeys.includes(key));
}

export function applyAcceptedVehicleTransfer(equipment = {}, transfer = {}, {acceptedAt = '', acceptedBy = ''} = {}) {
  return {
    ...equipment,
    currentLocation: String(transfer.destination || '').trim(),
    lastTransferNo: String(transfer.transferNo || '').trim(),
    lastTransferDate: String(transfer.transferDate || '').trim(),
    lastTransferAcceptedAt: String(acceptedAt || '').trim(),
    lastTransferAcceptedBy: String(acceptedBy || '').trim(),
  };
}

export function vehicleTransferProgress(record = {}) {
  const status = vehicleTransferStatus(record);
  return [
    {key: 'submitted', label: 'MIS submitted', complete: true, detail: record.submittedBy || ''},
    {key: 'source', label: 'Source PM approved', complete: status !== VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL, detail: record.sourceApprovedBy || ''},
    {key: 'mis', label: 'Destination MIS verified', complete: [VEHICLE_TRANSFER_STATUS.DESTINATION_ACCEPTANCE, VEHICLE_TRANSFER_STATUS.COMPLETED].includes(status), detail: record.destinationMisVerifiedBy || ''},
    {key: 'destination', label: 'Destination PM accepted', complete: status === VEHICLE_TRANSFER_STATUS.COMPLETED, detail: record.destinationAcceptedBy || ''},
  ];
}

const auditText = (value, limit = 240) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
const auditDate = (value) => {
  const text = auditText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text;
};

export function vehicleTransferWorkStatus(record = {}) {
  const status = vehicleTransferStatus(record);
  const completed = [
    `MIS submitted${record.submittedBy ? ` by ${auditText(record.submittedBy, 120)}` : ''}`,
    record.sourceApprovedAt ? `Source PM released${record.sourceApprovedBy ? ` by ${auditText(record.sourceApprovedBy, 120)}` : ''}` : '',
    record.destinationMisVerifiedAt ? `Destination MIS verified${record.destinationMisVerifiedBy ? ` by ${auditText(record.destinationMisVerifiedBy, 120)}` : ''}` : '',
    record.destinationAcceptedAt ? `Destination PM accepted${record.destinationAcceptedBy ? ` by ${auditText(record.destinationAcceptedBy, 120)}` : ''}` : '',
  ].filter(Boolean).join('; ');
  const pending = status === VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL
    ? `Source PM release at ${auditText(record.source)}`
    : status === VEHICLE_TRANSFER_STATUS.MIS_VERIFICATION
      ? `Destination MIS verification at ${auditText(record.destination)}`
      : status === VEHICLE_TRANSFER_STATUS.DESTINATION_ACCEPTANCE
        ? `Destination PM acceptance at ${auditText(record.destination)}`
        : 'None - transfer completed and Vehicle Master updated';
  return {completed,pending};
}

export function vehicleTransferAuditDetails(record = {}, {previousStatus = 'Draft'} = {}) {
  const work = vehicleTransferWorkStatus(record);
  const value = (item, limit = 240) => auditText(item, limit);
  const fields = [
    ['Transfer number',record.transferNo],['Transfer date',auditDate(record.transferDate)],['Vehicle / equipment',record.equipment],
    ['Door no.',record.door],['Registration no.',record.reg],['Model no.',record.modelNo],
    ['Manufacturing serial no.',record.manufacturerSerialNo],['Chassis no.',record.chassisNo],
    ['Source location',record.source],['Destination location',record.destination],['Driver',record.driver],
    ['Diesel quantity',record.dieselQty],['KMR',record.kmr],['HMR',record.hmr],['Transfer remarks',record.remarks],
    ['Work completed',work.completed],['Work pending',work.pending],
  ].filter(([,after])=>value(after)).map(([field,after])=>({field,before:'',after:value(after)}));
  fields.push({field:'Status',before:value(previousStatus),after:value(vehicleTransferStatus(record))});
  return {
    reason:`${value(record.equipment)||'Vehicle'}: ${value(record.source)||'Unspecified source'} to ${value(record.destination)||'Unspecified destination'}. Completed: ${work.completed}. Pending: ${work.pending}`,
    changedFields:fields,
  };
}

export function vehicleTransferViewRecords(records = [], view = VEHICLE_TRANSFER_VIEW.ALL) {
  if (view === VEHICLE_TRANSFER_VIEW.RELEASE) return records.filter((record) => record.canApproveSource);
  if (view === VEHICLE_TRANSFER_VIEW.ACCEPT) return records.filter((record) => record.canAcceptDestination);
  return records;
}
