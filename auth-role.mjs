export function matchesRequestedRole(value, requestedRole) {
  const type = String(value || '').trim().toLowerCase();
  if (requestedRole === 'super') return type.includes('super');
  return type.includes('mobile') || type.includes('normal');
}
