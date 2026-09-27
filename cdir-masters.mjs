/**
 * C-Dir (Caliber Directory) masters. The directory used to be one generated
 * JSON file; these seven masters now hold it so administrators can edit it in
 * Masters, and the C-Dir page is rebuilt from them on every load.
 *
 * Records reference each other by their visible names (for example an
 * employee's site is the Site / office name), so a CSV import reads naturally.
 * Renaming a referenced value cascades to the records that use it.
 */
export const CDIR_MASTERS = {
  region: 'C-Dir Region master',
  site: 'C-Dir Site & Office master',
  category: 'C-Dir Category master',
  department: 'C-Dir Department master',
  designation: 'C-Dir Designation master',
  employee: 'C-Dir Employee master',
  contact: 'C-Dir Contact master',
};
export const CDIR_MASTER_NAMES = Object.values(CDIR_MASTERS);
export const isCdirMaster = (name) => CDIR_MASTER_NAMES.includes(String(name || ''));

// [key, label, type]. "ref:<master>:<key>" picks a value from another master;
// "options:A|B" is a fixed list. The first field is required.
export const CDIR_MASTER_FIELDS = {
  [CDIR_MASTERS.region]: [['code', 'Region code'], ['name', 'Region name'], ['order', 'Display order']],
  [CDIR_MASTERS.site]: [['name', 'Site / office name'], ['code', 'Site code'], ['region', 'Region', `ref:${CDIR_MASTERS.region}:code`],
    ['rosterKey', 'Roster key'], ['inRoster', 'In roster', 'options:Yes|No'], ['order', 'Display order']],
  [CDIR_MASTERS.category]: [['code', 'Category'], ['description', 'Description'], ['order', 'Display order']],
  [CDIR_MASTERS.department]: [['department', 'Department']],
  [CDIR_MASTERS.designation]: [['designation', 'Designation'], ['category', 'Default category', `ref:${CDIR_MASTERS.category}:code`], ['rank', 'Rank']],
  [CDIR_MASTERS.employee]: [
    ['site', 'Site / office', `ref:${CDIR_MASTERS.site}:name`], ['category', 'Category', `ref:${CDIR_MASTERS.category}:code`],
    ['designation', 'Designation', `ref:${CDIR_MASTERS.designation}:designation`], ['department', 'Department', `ref:${CDIR_MASTERS.department}:department`],
    ['name', 'Employee name'], ['empId', 'Emp ID'], ['reportingTo', 'Reports to'], ['status', 'Status', 'options:ACTIVE|VACANT|RESIGNED'],
    ['gender', 'Gender', 'options:|Male|Female'], ['dob', 'Date of birth', 'date'], ['doj', 'Date of joining', 'date'], ['uan', 'UAN'],
    ['staffLevel', 'Level', 'options:|Level 1|Level 2|Level 3'], ['localStatus', 'Local / camp', 'options:|LOCAL|CAMP'],
    ['aadharMasked', 'Aadhaar (masked)'], ['rank', 'Rank'], ['order', 'Display order'],
  ],
  [CDIR_MASTERS.contact]: [['name', 'Employee name'], ['empId', 'Emp ID'], ['contact', 'Phone no.'], ['whatsapp', 'WhatsApp no.'],
    ['emergencyContact', 'Emergency contact'], ['email', 'Email']],
};

// Renaming these values updates every record that references them.
export const CDIR_CASCADES = {
  [CDIR_MASTERS.region]: {key: 'code', dependents: [[CDIR_MASTERS.site, 'region']]},
  [CDIR_MASTERS.site]: {key: 'name', dependents: [[CDIR_MASTERS.employee, 'site']]},
  [CDIR_MASTERS.category]: {key: 'code', dependents: [[CDIR_MASTERS.employee, 'category'], [CDIR_MASTERS.designation, 'category']]},
  [CDIR_MASTERS.department]: {key: 'department', dependents: [[CDIR_MASTERS.employee, 'department']]},
  [CDIR_MASTERS.designation]: {key: 'designation', dependents: [[CDIR_MASTERS.employee, 'designation']]},
};

const REGION_NAMES = {CORP: 'Corporate offices', WCL: 'Western Coalfields Ltd.', NCL: 'Northern Coalfields Ltd.', OTHER: 'Other'};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clean = (value) => String(value ?? '').trim();
// Designations, departments, names and codes are kept in capitals with single
// spaces, so "Store Manager" and "STORE  MANAGER" are one value.
export const cdirCaps = (value) => clean(value).replace(/\s+/g, ' ').toUpperCase();
export const CDIR_CAPITAL_FIELDS = {
  [CDIR_MASTERS.region]: ['code'],
  [CDIR_MASTERS.category]: ['code'],
  [CDIR_MASTERS.department]: ['department'],
  [CDIR_MASTERS.designation]: ['designation', 'category'],
  [CDIR_MASTERS.employee]: ['category', 'designation', 'department', 'name', 'empId', 'reportingTo'],
  [CDIR_MASTERS.contact]: ['name', 'empId'],
  [CDIR_MASTERS.site]: ['region'],
};
// The value that must be unique in each master (compared in capitals).
export const CDIR_UNIQUE_KEYS = {
  [CDIR_MASTERS.region]: 'code', [CDIR_MASTERS.site]: 'name', [CDIR_MASTERS.category]: 'code',
  [CDIR_MASTERS.department]: 'department', [CDIR_MASTERS.designation]: 'designation',
};

/** Applies the capitals rule to one record of a C-Dir master. */
export function cdirNormalizeRecord(master, record = {}) {
  const next = {...record};
  for (const key of CDIR_CAPITAL_FIELDS[master] || []) if (typeof next[key] === 'string' || next[key] == null) next[key] = cdirCaps(next[key]);
  return next;
}
const text = (value) => clean(value).toLowerCase();
const numberOr = (value, fallback) => {const number = Number(clean(value)); return clean(value) !== '' && Number.isFinite(number) ? number : fallback;};
const mostCommon = (values) => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** "1974-09-28" (or "28-Sep-1974") → {iso, display, month, day}; blank when unreadable. */
export function cdirDate(value) {
  const raw = clean(value);
  let year, month, day;
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) [, year, month, day] = match.map(Number);
  else if ((match = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*[-/ ](\d{4})$/))) {
    day = Number(match[1]); month = MONTHS.findIndex((name) => name.toLowerCase() === match[2].toLowerCase()) + 1; year = Number(match[3]);
  } else if ((match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/))) [, day, month, year] = match.map(Number);
  if (!year || !month || !day || month > 12 || day > 31) return {iso: '', display: '', month: null, day: null};
  const pad = (n) => String(n).padStart(2, '0');
  return {iso: `${year}-${pad(month)}-${pad(day)}`, display: `${pad(day)}-${MONTHS[month - 1]}-${year}`, month, day};
}

/** One-time import: splits the generated directory JSON into the seven masters. */
export function cdirMastersFromDirectory(data = {}) {
  const sites = data.sites || [], categories = data.categories || [];
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const rows = Object.entries(data.matrix || {}).flatMap(([key, people]) => {
    const [siteId, category] = key.split('|');
    return (people || []).map((person) => ({siteId, category, person: {...person, designation: cdirCaps(person.designation),
      department: cdirCaps(person.department), name: cdirCaps(person.name), empId: cdirCaps(person.empId), reportingTo: cdirCaps(person.reportingTo)}}));
  });
  const designationRows = new Map();
  for (const {person, category} of rows) {
    if (!clean(person.designation)) continue;
    const list = designationRows.get(person.designation) || [];
    list.push({category, rank: person.rank});
    designationRows.set(person.designation, list);
  }
  const contacts = new Map();
  for (const {person} of rows) {
    if (person.status === 'VACANT' || !clean(person.name)) continue;
    const key = clean(person.empId) ? `id:${text(person.empId)}` : `nm:${text(person.name)}`;
    if (contacts.has(key)) continue;
    contacts.set(key, {name: clean(person.name), empId: clean(person.empId), contact: clean(person.contact), whatsapp: clean(person.whatsapp),
      emergencyContact: clean(person.emergencyContact), email: clean(person.email)});
  }
  return {
    [CDIR_MASTERS.region]: [...new Set(sites.map((site) => site.group).filter(Boolean))]
      .map((code, index) => ({code, name: REGION_NAMES[code] || code, order: String(index + 1)})),
    [CDIR_MASTERS.site]: sites.map((site, index) => ({name: site.label, code: site.id, region: site.group || '', rosterKey: site.dataKey || '',
      inRoster: site.flag === 'not_in_roster' ? 'No' : 'Yes', order: String(index + 1)})),
    [CDIR_MASTERS.category]: categories.map((code, index) => ({code, description: '', order: String(index + 1)})),
    [CDIR_MASTERS.department]: [...new Set(rows.map(({person}) => clean(person.department)).filter(Boolean))].sort().map((department) => ({department})),
    [CDIR_MASTERS.designation]: [...designationRows].sort(([a], [b]) => a.localeCompare(b)).map(([designation, list]) => ({
      designation, category: mostCommon(list.map((item) => item.category)) || '', rank: String(mostCommon(list.map((item) => item.rank)) ?? '')})),
    [CDIR_MASTERS.employee]: rows.map(({person, siteId, category}, index) => ({
      site: siteById.get(siteId)?.label || siteId, category, designation: clean(person.designation), department: clean(person.department),
      name: clean(person.name), empId: clean(person.empId), reportingTo: clean(person.reportingTo), status: clean(person.status) || 'ACTIVE',
      gender: clean(person.gender), dob: cdirDate(person.dobISO || person.dob).iso, doj: cdirDate(person.dojISO || person.doj).iso, uan: clean(person.uan),
      staffLevel: clean(person.level), localStatus: clean(person.localStatus), aadharMasked: clean(person.aadharMasked),
      rank: String(person.rank ?? ''), order: String(index + 1),
    })),
    [CDIR_MASTERS.contact]: [...contacts.values()],
  };
}

const byOrder = (a, b) => numberOr(a.order, 1e9) - numberOr(b.order, 1e9);

/** Rebuilds the C-Dir page data (same shape as directory-data.json) from the masters. */
export function cdirDirectoryFromMasters(masters = {}, {generated = ''} = {}) {
  const list = (name) => Array.isArray(masters[name]) ? masters[name] : [];
  const siteRecords = [...list(CDIR_MASTERS.site)].filter((site) => clean(site.name)).sort(byOrder);
  const sites = siteRecords.map((site) => ({id: clean(site.code) || text(site.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    label: clean(site.name), flag: clean(site.inRoster).toLowerCase() === 'no' ? 'not_in_roster' : null,
    dataKey: clean(site.rosterKey) || null, group: clean(site.region) || null}));
  const siteIdByName = new Map(siteRecords.map((site, index) => [text(site.name), sites[index].id]));
  const categories = [...list(CDIR_MASTERS.category)].filter((category) => clean(category.code)).sort(byOrder).map((category) => clean(category.code));
  const contactById = new Map(), contactByName = new Map();
  for (const contact of list(CDIR_MASTERS.contact)) {
    if (clean(contact.empId)) contactById.set(text(contact.empId), contact);
    if (clean(contact.name)) contactByName.set(text(contact.name), contact);
  }
  const matrix = {};
  const employees = [...list(CDIR_MASTERS.employee)].sort(byOrder);
  for (const employee of employees) {
    const siteId = siteIdByName.get(text(employee.site));
    const category = clean(employee.category);
    // Rows pointing at a site or category that no longer exists cannot be placed.
    if (!siteId || !categories.includes(category)) continue;
    const status = clean(employee.status).toUpperCase() || 'ACTIVE';
    const vacant = status === 'VACANT';
    const contact = vacant ? {} : (clean(employee.empId) && contactById.get(text(employee.empId))) || contactByName.get(text(employee.name)) || {};
    const dob = cdirDate(employee.dob), doj = cdirDate(employee.doj);
    (matrix[`${siteId}|${category}`] ||= []).push({
      empId: clean(employee.empId), name: clean(employee.name) || null, designation: clean(employee.designation), department: clean(employee.department),
      contact: clean(contact.contact), whatsapp: clean(contact.whatsapp), emergencyContact: clean(contact.emergencyContact), email: clean(contact.email),
      dob: dob.display, dobISO: dob.iso, dobMonth: dob.month, dobDay: dob.day, doj: doj.display, dojISO: doj.iso,
      uan: clean(employee.uan), gender: clean(employee.gender), status, reportingTo: clean(employee.reportingTo), level: clean(employee.staffLevel),
      aadharMasked: clean(employee.aadharMasked), localStatus: clean(employee.localStatus), rank: numberOr(employee.rank, 30),
    });
  }
  const siteTotals = {}, siteStats = {}, categoryTotalsUnique = {}, departments = new Set();
  let filled = 0, vacant = 0;
  for (const site of sites) {
    const roster = categories.flatMap((category) => matrix[`${site.id}|${category}`] || []);
    siteTotals[site.id] = roster.length;
    siteStats[site.id] = {sanctioned: roster.length, filled: roster.filter((row) => row.status === 'ACTIVE').length, vacant: roster.filter((row) => row.status === 'VACANT').length};
    filled += siteStats[site.id].filled; vacant += siteStats[site.id].vacant;
    roster.forEach((row) => row.department && departments.add(row.department));
  }
  for (const category of categories) {
    const count = sites.reduce((total, site) => total + (matrix[`${site.id}|${category}`]?.length || 0), 0);
    if (count) categoryTotalsUnique[category] = count;
  }
  const sanctioned = Object.values(siteTotals).reduce((total, count) => total + count, 0);
  return {
    meta: {generated, totalStaffSanctioned: sanctioned, totalFilled: filled, totalVacant: vacant,
      totalSitesOffices: sites.filter((site) => siteTotals[site.id] > 0).length, totalDepartments: departments.size},
    sites, categories, matrix, siteTotals, siteStats, categoryTotalsUnique,
  };
}

/** Checks an employee row against the other masters before it is saved. */
export function cdirEmployeeError(record = {}, masters = {}) {
  const has = (name, key, value) => (masters[name] || []).some((item) => text(item[key]) === text(value));
  if (!clean(record.site) || !has(CDIR_MASTERS.site, 'name', record.site)) return `Site / office "${clean(record.site)}" is not in the C-Dir Site & Office master.`;
  if (!clean(record.category) || !has(CDIR_MASTERS.category, 'code', record.category)) return `Category "${clean(record.category)}" is not in the C-Dir Category master.`;
  const status = clean(record.status).toUpperCase() || 'ACTIVE';
  if (!['ACTIVE', 'VACANT', 'RESIGNED'].includes(status)) return 'Status must be ACTIVE, VACANT or RESIGNED.';
  if (status !== 'VACANT' && !clean(record.name)) return 'Enter the employee name, or set the status to VACANT.';
  return '';
}
