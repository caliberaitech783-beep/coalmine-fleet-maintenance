import {canonicalSiteName,equipmentSiteName} from './site-location.mjs';
const text = value => String(value ?? '').trim();
const key = value => text(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Imported equipment names contain the fleet door label (for example
// "WT22 - MP66ZD0582"). When no door label exists, use registration as the
// shared display/create fallback. Never substitute a chassis or serial number.
export function equipmentDoorNumber(record = {}) {
  const usable = value => key(value) && !['na','notavailable','notapplicable','unknown','none','null'].includes(key(value));
  const nonDoors = new Set([record.reg, record.registration, record.registrationNumber, record.chassisNo,
    record.chassis, record.manufacturerSerialNo, record.engineNo].map(key).filter(Boolean));
  const door = text(record.door);
  if (usable(door) && !nonDoors.has(key(door))) return door;
  const name = text(record.equipmentName);
  if (name && /\d/.test(name) && !nonDoors.has(key(name)) &&
      ![record.model, record.modelNo, record.itemName, record.group, record.category].some(value => key(value) && key(value) === key(name))) return name;
  return [record.reg,record.registration,record.registrationNumber].map(text).find(usable) || '';
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
    for (const value of [record.door,record.reg,record.registration,record.equipmentName]) add(index,key(value),record);
  }
  return (request = {}) => {
    for (const field of ['chassis','reg','door','equipment']) {
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
      if (!door) return request;
      return {...request, door, ...(Object.hasOwn(request, 'reportDoor') ? {reportDoor: door} : {})};
    }
    const fallback = !key(request.door) ? equipmentDoorNumber(request) : '';
    return fallback ? {...request,door:fallback,...(Object.hasOwn(request,'reportDoor')?{reportDoor:fallback}:{})} : request;
  };
}

export function requestsWithDoorNumbers(requests = [], records = []) {
  return requests.map(createRequestDoorResolver(records));
}
