import {parseRequestTimelineTimestamp} from '../request-timeline.mjs';

export const downtimeToday = (now = Date.now()) => new Date(now + 19800000).toISOString().slice(0,10);
const epoch = value => parseRequestTimelineTimestamp(value)?.getTime();
const identity = row => String(row.chassis || row.manufacturerSerialNo || row.chassisNo || row.reportDoor || row.door || row.reg || row.reportEquipment || row.equipmentName || row.equipment || '').trim().toLowerCase();

export function downtimeMatrix(requests, equipment, date, now = Date.now()) {
  const start = epoch(`${date}T00:00:00`), end = start + 86400000;
  if (!Number.isFinite(start) || downtimeToday(start) !== date || start > now) return [];
  const groups = new Map();
  const add = row => {
    const site = row.reportSite || row.site || row.currentLocation || row.location || '—';
    const id = identity(row);
    if (!id) return null;
    const key = `${site}:${id}`;
    if (!groups.has(key)) groups.set(key, {key, site, door:row.reportDoor || row.door || row.reg || row.equipmentName || row.equipment || id, events:[]});
    return groups.get(key);
  };
  equipment.forEach(add);
  requests.forEach(row => {
    const from = epoch(row.start || row.startedAt || row.createdAt);
    const closed = epoch(row.closedAt);
    if (!Number.isFinite(from) || (row.closedAt && !Number.isFinite(closed))) return;
    const to = Math.min(closed ?? now, now, end), clipped = Math.max(from, start);
    if (to <= clipped) return;
    add(row)?.events.push({ref:row.ref || '—', start:clipped, end:to, hours:(to-clipped)/3600000, reason:row.complaint || row.reason || '—', open:closed == null});
  });
  return [...groups.values()].map(row => {
    row.events.sort((a,b)=>a.start-b.start);
    let total = 0, last = start;
    for (const event of row.events) { total += Math.max(0,event.end-Math.max(event.start,last)); last = Math.max(last,event.end); }
    const downtime = total/3600000;
    return {...row, downtime, available:24-downtime};
  }).sort((a,b)=>a.site.localeCompare(b.site)||a.door.localeCompare(b.door,undefined,{numeric:true}));
}
