const clean = (value) => String(value ?? '').trim();
const keyText = (value) => clean(value).toLowerCase().replace(/\s+/g, ' ');
const activePerson = (person) => clean(person?.status).toUpperCase() !== 'VACANT' && Boolean(clean(person?.name));

const listText = (value) => (Array.isArray(value) ? value : String(value ?? '').split(/\s*[|,;\n]\s*/))
  .map(clean).filter(Boolean);

const userAliases = (user = {}) => [
  user.employee, user.name, user.login, user.empId, user.employeeId, user.employeeCode,
].map(keyText).filter(Boolean);

const personAliases = (person = {}) => [person.name, person.empId].map(keyText).filter(Boolean);

/**
 * Adds a missing C-Directory reporting line from Users & employees.Superior.
 * Only the reporting name is copied; account, role and permission fields never
 * become part of the directory response.
 */
export function mergeCdirReportingSuperiors(directory = {}, users = []) {
  const superiorByAlias = new Map();
  for (const user of users) {
    const superior = listText(user?.superior).join(' | ');
    if (!superior) continue;
    for (const alias of userAliases(user)) if (!superiorByAlias.has(alias)) superiorByAlias.set(alias, superior);
  }
  const matrix = Object.fromEntries(Object.entries(directory.matrix || {}).map(([bucket, people]) => [bucket,
    (people || []).map((person) => {
      if (!activePerson(person) || clean(person.reportingTo)) return person;
      const superior = personAliases(person).map((alias) => superiorByAlias.get(alias)).find(Boolean);
      return superior ? { ...person, reportingTo: superior } : person;
    }),
  ]));
  return { ...directory, matrix };
}

export function cdirPersonId(person = {}) {
  const employeeId = keyText(person.empId);
  return employeeId ? `id:${employeeId}` : `name:${keyText(person.name)}`;
}

const personOrder = (a, b) => (Number(b.rank) || 0) - (Number(a.rank) || 0)
  || clean(a.siteLabel).localeCompare(clean(b.siteLabel)) || clean(a.name).localeCompare(clean(b.name));

/** Builds a cycle-safe, multi-level reporting model from the scoped directory. */
export function buildCdirOrganisation(rows = []) {
  const personById = new Map();
  for (const person of rows.filter(activePerson)) {
    const id = cdirPersonId(person);
    if (!id || id === 'name:') continue;
    const existing = personById.get(id);
    personById.set(id, existing ? {
      ...person,
      ...Object.fromEntries(Object.entries(existing).filter(([, value]) => clean(value))),
      reportingTo: clean(existing.reportingTo) || clean(person.reportingTo),
    } : person);
  }

  const aliasToId = new Map();
  for (const [id, person] of personById) {
    for (const alias of personAliases(person)) if (!aliasToId.has(alias)) aliasToId.set(alias, id);
  }

  const parentById = new Map(), childrenById = new Map();
  for (const [id, person] of personById) {
    const parentId = listText(person.reportingTo).map((name) => aliasToId.get(keyText(name))).find((candidate) => candidate && candidate !== id);
    if (!parentId) continue;
    parentById.set(id, parentId);
    if (!childrenById.has(parentId)) childrenById.set(parentId, []);
    childrenById.get(parentId).push(id);
  }
  for (const children of childrenById.values()) children.sort((a, b) => personOrder(personById.get(a), personById.get(b)));

  const managerIds = new Set(childrenById.keys());
  const roots = [...managerIds].filter((id) => !managerIds.has(parentById.get(id)))
    .sort((a, b) => personOrder(personById.get(a), personById.get(b)));
  // A malformed Superior cycle must not make every manager disappear.
  if (!roots.length && managerIds.size) roots.push(...[...managerIds].sort((a, b) => personOrder(personById.get(a), personById.get(b))));

  const descendantIds = (rootId) => {
    const result = [], visited = new Set([rootId]);
    const visit = (id) => {
      for (const childId of childrenById.get(id) || []) {
        if (visited.has(childId)) continue;
        visited.add(childId); result.push(childId); visit(childId);
      }
    };
    visit(rootId);
    return result;
  };

  return { people: [...personById.values()], personById, parentById, childrenById, managerIds, roots, descendantIds };
}
