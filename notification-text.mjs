const value = (input) => String(input ?? '').trim();
const meaningful = (input) => !['', '-', '—', 'n/a', 'not available'].includes(value(input).toLowerCase());
const escape = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Format legacy messages at read time, without rewriting saved history or
// changing WhatsApp templates. Structured request/ticket data takes priority.
export function notificationParts(item = {}) {
  let details = value(item.message);
  const legacySite = details.match(/\b(?:Location|Site):\s*(.+?)(?=\.\s+[A-Z][\w ]*:|\.\s*$|\s*\||$)/i)?.[1];
  const legacyDoor = details.match(/\bDoor(?: No\.?)?:\s*([^|]+?)(?=\s*\||\.\s+[A-Z][\w ]*:|$)/i)?.[1];
  const site = meaningful(item.site) ? value(item.site) : value(legacySite);
  const door = meaningful(item.door) ? value(item.door) : value(legacyDoor);
  if (meaningful(site)) details = details.replace(new RegExp(`\\b(?:Location|Site):\\s*${escape(site)}(?=\\.\\s|\\.$|\\s*\\||$)\\.?\\s*`, 'gi'), '');
  details = details
    .replace(/\b(opened|closed) for [^|]+\|\s*(?=Door:)/gi, '$1. ')
    .replace(/\bDoor(?: No\.?)?:\s*([^|]+?)(?=\s*\||\.\s+[A-Z][\w ]*:|$)\s*\|?\s*/gi, '')
    .replace(/\bChassis(?:\s+(?:No\.?|Number))?:\s*[^|]+?(?=\s*\||\.\s+[A-Z][\w &/()]*:|\.\s*$|$)\.?\s*\|?\s*/gi, '');
  // Do not globally replace a numeric door: it may also be a time or duration.
  if (meaningful(door)) details = details.replace(new RegExp(`\\b(opened|closed) for ${escape(door)}(?=\\s*\\||\\.\\s|\\.$|$)`, 'gi'), '$1');
  details = details.replace(/\s*\|\s*/g, ' · ').replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').trim();
  return {site: meaningful(site) ? site : 'Not recorded', door: meaningful(door) ? door : '', details};
}

export function notificationText(item = {}) {
  const {site,door,details}=notificationParts(item);
  return [`Site: ${site}`,door ? `Door No. ${door}` : '',details].filter(Boolean).join(' — ');
}

const siteKey = (site) => value(site).replace(/\s+/g, ' ').toLowerCase();
export function notificationSiteOptions(items, selected = '') {
  const sites = new Map();
  for (const site of [selected, ...items.map((item) => notificationParts(item).site)]) {
    if (site && !sites.has(siteKey(site))) sites.set(siteKey(site), site);
  }
  return [...sites.values()].sort((a,b) => a.localeCompare(b));
}

export function filterNotificationsBySite(items, site = '') {
  return site ? items.filter((item) => siteKey(notificationParts(item).site) === siteKey(site)) : items;
}
