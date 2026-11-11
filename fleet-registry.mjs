const norm = value => String(value || '').trim().toUpperCase();
export const isLmvRequest = row => norm(row.equipmentGroup) === 'LMV';
export const isLmvAsset = row => row.fleetSource === 'LMV master' || norm(row.group || row.equipmentGroup) === 'LMV' || norm(row.category) === 'LMV';

// Prefer the LMV registry when an older Equipment Master entry represents the
// same asset. Never merge records just because their display names match.
export function lmvRegistryRecords(lmvs = [], equipment = []) {
  const identity = row => String(row.chassisNo || row.chassis || row.manufacturerSerialNo || row.door || row.registration || row.reg || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const known = new Set(lmvs.map(identity).filter(Boolean));
  return [...lmvs, ...equipment.filter(row => isLmvAsset(row) && (!identity(row) || !known.has(identity(row))))]
    .map(row => ({...row, fleetSource: 'LMV master'}));
}
