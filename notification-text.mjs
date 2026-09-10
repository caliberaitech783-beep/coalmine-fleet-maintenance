const value = (input) => String(input ?? '').trim();
const meaningful = (input) => !['', '-', '—', 'n/a', 'not available'].includes(value(input).toLowerCase());
const escape = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Format legacy messages at read time, without rewriting saved history or
// changing WhatsApp templates. Structured request/ticket data takes priority.
export function notificationText(item = {}) {
  let details = value(item.message);
  const legacySite = details.match(/\b(?:Location|Site):\s*(.+?)(?=\.\s+[A-Z][\w ]*:|\.\s*$|\s*\||$)/i)?.[1];
  const legacyDoor = details.match(/\bDoor(?: No\.?)?:\s*([^|]+?)(?=\s*\||\.\s+[A-Z][\w ]*:|$)/i)?.[1];
  const site = meaningful(item.site) ? value(item.site) : value(legacySite);
  const door = meaningful(item.door) ? value(item.door) : value(legacyDoor);
  if (meaningful(site)) details = details.replace(new RegExp(`\\b(?:Location|Site):\\s*${escape(site)}(?=\\.\\s|\\.$|\\s*\\||$)\\.?\\s*`, 'gi'), '');
  details = details
    .replace(/\b(opened|closed) for [^|]+\|\s*(?=Door:)/gi, '$1. ')
    .replace(/\bDoor(?: No\.?)?:\s*([^|]+?)(?=\s*\||\.\s+[A-Z][\w ]*:|$)\s*\|?\s*/gi, '');
  // Do not globally replace a numeric door: it may also be a time or duration.
  if (meaningful(door)) details = details.replace(new RegExp(`\\b(opened|closed) for ${escape(door)}(?=\\s*\\||\\.\\s|\\.$|$)`, 'gi'), '$1');
  details = details.replace(/\s*\|\s*/g, ' · ').replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').trim();
  return [meaningful(site) ? `Site: ${site}` : 'Site: Not recorded',
    meaningful(door) ? `Door No. ${door}` : '', details].filter(Boolean).join(' — ');
}
