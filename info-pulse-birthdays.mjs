import {readFile} from 'node:fs/promises';

export function birthdayNames(roster, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Kolkata',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const month = Number(parts.find(part => part.type === 'month').value);
  const day = Number(parts.find(part => part.type === 'day').value);
  const seen = new Set();
  return Object.values(roster?.matrix || {}).flat().filter(person => {
    if (String(person.status || '').trim().toUpperCase() !== 'ACTIVE') return false;
    const name = String(person.name || '').trim();
    const id = String(person.empId || name).trim().toLowerCase();
    if (!name || seen.has(id) || Number(person.dobMonth) !== month || Number(person.dobDay) !== day) return false;
    seen.add(id);
    return true;
  }).map(person => String(person.name).trim()).sort((a,b) => a.localeCompare(b));
}

let rosterPromise;
export async function currentBirthdayNames(date = new Date()) {
  rosterPromise ||= readFile(new URL('./public/cd/directory-data.json', import.meta.url), 'utf8')
    .then(JSON.parse).catch(error => {rosterPromise = undefined; throw error;});
  return birthdayNames(await rosterPromise, date);
}
