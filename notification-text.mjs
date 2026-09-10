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

const categories = [
  {key: 'production', label: 'Production'},
  {key: 'maintenance', label: 'Maintenance'},
  {key: 'mis', label: 'MIS'},
  {key: 'other', label: 'Other'},
];

export function notificationCategory(item = {}) {
  // Ticket categories are structured data. Request notifications describe a
  // historical event, so their category must not follow the request's current status.
  const ticketCategory = value(item.ticketCategory).toLowerCase();
  let key = ticketCategory;
  if (!ticketCategory) {
    const message = value(item.message);
    if (/^Request(?:\s+\S+)?\s+(?:was\s+)?verified\b/i.test(message)) key = 'mis';
    else if (/^Request(?:\s+\S+)?\s+(?:was\s+)?opened\b/i.test(message)) key = 'production';
    else if (/^Request(?:\s+\S+)?\s+(?:closed\b|was\s+(?:closed\b|marked\s+Idle\b|approved\s+on\s+road\b))/i.test(message)
      || /^Idle status for request\s+\S+\s+was cancelled\b/i.test(message)
      || /^\d{1,2}:\d{2}\s+reminder:\s+add today[’']s maintenance update\b/i.test(message)
      || /\b(?:added a|updated today[’']s) daily maintenance update for\s+\S+\.?$/i.test(message)) key = 'maintenance';
  }
  return categories.find(category => category.key === key) || categories[3];
}

export function notificationCategoryOptions(items, selected = '') {
  const counts = new Map(categories.map(category => [category.key, 0]));
  for (const item of items) {
    const {key} = notificationCategory(item);
    counts.set(key, counts.get(key) + 1);
  }
  return categories.filter(category => category.key !== 'other' || counts.get('other') || selected === 'other')
    .map(category => ({...category, count: counts.get(category.key)}));
}

export function filterNotificationsByCategory(items, category = '') {
  return category ? items.filter(item => notificationCategory(item).key === category) : items;
}
