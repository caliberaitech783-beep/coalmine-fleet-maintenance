// Canonical reporting labels only: never merge assets, rewrite identifiers,
// or treat different punctuation/plurals as the same equipment group.
export function normalizeEquipmentGroup(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
}

export function equipmentGroupValue(record = {}, fallback = '') {
  return normalizeEquipmentGroup(record.group) || normalizeEquipmentGroup(record.equipmentGroup) || fallback;
}
