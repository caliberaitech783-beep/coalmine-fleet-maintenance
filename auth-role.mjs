export function matchesRequestedRole(value, requestedRole) {
  const type = String(value || '').trim().toLowerCase();
  if (requestedRole === 'super') return type.includes('super');
  return type.includes('mobile') || type.includes('normal');
}

export function filterRowsByRequestedRole(rows = [], requestedRole = 'normal') {
  return rows.filter((row) => {
    const record = row?.record_data || row || {};
    return matchesRequestedRole(record.userType || record.role || record.accessType, requestedRole);
  });
}
