import {canonicalSiteName,equipmentSiteName} from './site-location.mjs';
const text = value => String(value ?? '').trim();
const key = value => text(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Imported master rows display their fleet label in equipmentName; door may
// instead contain an Oracle ID/registration, or be blank. Use that verified
// master label, never a standalone registration/chassis or generic model.
export function equipmentDoorNumber(record = {}) {
  const usable = value => key(value) && !['na','notavailable','notapplicable','unknown','none','null'].includes(key(value));
  const door = text(record.door);
  const identifiers = new Set([record.reg,record.registration,record.registrationNumber,record.chassisNo,
    record.chassis,record.manufacturerSerialNo,record.engineNo].map(key).filter(Boolean));
  const name = text(record.equipmentName);
  const masterLabel = usable(name) && /\d/.test(name) && !identifiers.has(key(name)) &&
    ![record.model,record.modelNo,record.itemName,record.group,record.category].some(value => key(value) && key(value) === key(name)) ? name : '';
  if (usable(door) && !identifiers.has(key(door))) return door;
  return masterLabel || (usable(door) ? door : '');
}

// Build once per feed, rather than scanning the master again for every row.
// Ambiguous identifiers are never resolved to the first matching vehicle.
export function createRequestDoorResolver(records = []) {
  const index = new Map(), serialIndex = new Map();
  const add = (target, identifier, record) => {
    if (!identifier || ['na','notavailable','notapplicable','unknown','none','null'].includes(identifier)) return;
    if (!target.has(identifier)) target.set(identifier, new Set());
    target.get(identifier).add(record);
  };
  for (const record of records) {
    for (const value of [record.chassisNo,record.chassis,record.manufacturerSerialNo]) add(serialIndex,key(value),record);
    for (const value of [record.door,equipmentDoorNumber(record),record.reg,record.registration,record.registrationNumber,record.equipmentName]) add(index,key(value),record);
  }
  return (request = {}) => {
    for (const field of ['chassis','reg','door','doorLookupReference','equipment']) {
      const value=request[field];
      const matches = (field==='chassis'?serialIndex:index).get(key(value));
      if (matches?.size !== 1) continue;
      const record = [...matches][0];
      const chassis = key(request.chassis);
      const masterChassis = [record.chassisNo, record.chassis, record.manufacturerSerialNo].map(key).filter(Boolean);
      if (chassis && masterChassis.length && !masterChassis.includes(chassis)) continue;
      const site=canonicalSiteName(request.site), masterSite=canonicalSiteName(equipmentSiteName(record));
      if (field!=='chassis' && site && masterSite && site!==masterSite) continue;
      // Do not infer a vehicle from a generic group or model name alone.
      if (field === 'equipment' && !/\d/.test(text(value))) continue;
      const door = equipmentDoorNumber(record);
      return {...request, door, ...(Object.hasOwn(request, 'reportDoor') ? {reportDoor: door} : {})};
    }
    return {...request,...(request.door ? {doorLookupReference:request.door} : {}),...(Object.hasOwn(request,'door')?{door:''}:{}),...(Object.hasOwn(request,'reportDoor')?{reportDoor:''}:{})};
  };
}

export function requestsWithDoorNumbers(requests = [], records = []) {
  return requests.map(createRequestDoorResolver(records));
}
