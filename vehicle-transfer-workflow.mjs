import {canonicalSiteName} from './site-location.mjs';

export const VEHICLE_TRANSFER_STATUS = Object.freeze({
  SOURCE_APPROVAL: 'Awaiting source approval',
  MIS_VERIFICATION: 'Awaiting destination MIS verification',
  DESTINATION_ACCEPTANCE: 'Awaiting destination PM acceptance',
  COMPLETED: 'Completed',
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
