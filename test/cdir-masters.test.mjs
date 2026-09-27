import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CDIR_MASTERS, CDIR_MASTER_NAMES, CDIR_MASTER_FIELDS, CDIR_CASCADES, cdirCaps, cdirNormalizeRecord, cdirDate, cdirDirectoryFromMasters, cdirEmployeeError, cdirMastersFromDirectory, isCdirMaster } from "../cdir-masters.mjs";
import { masterAccessAllows } from "../admin-access.mjs";

const data = JSON.parse(readFileSync(new URL("../public/cd/directory-data.json", import.meta.url), "utf8"));
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/cd/caliber-directory.html", import.meta.url), "utf8");

test("the directory file splits into the seven C-Dir masters", () => {
  const masters = cdirMastersFromDirectory(data);
  assert.deepEqual(Object.keys(masters).sort(), [...CDIR_MASTER_NAMES].sort());
  assert.equal(masters[CDIR_MASTERS.employee].length, data.meta.totalStaffSanctioned);
  assert.equal(masters[CDIR_MASTERS.site].length, data.sites.length);
  assert.deepEqual(masters[CDIR_MASTERS.category].map((category) => category.code), data.categories);
  assert.deepEqual(masters[CDIR_MASTERS.region].map((region) => region.code), ["CORP", "WCL", "NCL", "OTHER"]);
  assert.ok(masters[CDIR_MASTERS.contact].every((contact) => contact.name));
  for (const [name, fields] of Object.entries(CDIR_MASTER_FIELDS)) {
    for (const record of masters[name]) assert.ok(Object.keys(record).every((key) => fields.some(([field]) => field === key)), `${name} has only its own fields`);
  }
});

test("rebuilding C-Dir from the masters reproduces the directory, apart from known contact conflicts", () => {
  const rebuilt = cdirDirectoryFromMasters(cdirMastersFromDirectory(data), { generated: data.meta.generated });
  assert.deepEqual(rebuilt.sites, data.sites);
  assert.deepEqual(rebuilt.categories, data.categories);
  assert.deepEqual(rebuilt.siteTotals, data.siteTotals);
  assert.deepEqual(rebuilt.siteStats, data.siteStats);
  assert.deepEqual(rebuilt.categoryTotalsUnique, data.categoryTotalsUnique);
  const { totalDepartments, ...meta } = rebuilt.meta;
  const { totalDepartments: _unused, ...originalMeta } = data.meta;
  assert.deepEqual(meta, originalMeta);
  const contactFields = new Set(["contact", "whatsapp", "emergencyContact", "email"]);
  const conflicts = new Set();
  for (const [bucket, people] of Object.entries(data.matrix)) {
    const rebuiltPeople = rebuilt.matrix[bucket] || [];
    assert.equal(rebuiltPeople.length, people.length, bucket);
    people.forEach((person, index) => {
      for (const [field, value] of Object.entries(person)) {
        // Designations, departments and names are stored in capitals with single spaces.
        const expected = ["designation", "department", "name", "empId", "reportingTo"].includes(field) && value ? cdirCaps(value) : value;
        if (field === "_k" || JSON.stringify(rebuiltPeople[index][field]) === JSON.stringify(expected)) continue;
        assert.ok(contactFields.has(field), `${bucket} #${index} ${field}`);
        conflicts.add(person.empId);
      }
    });
  }
  // One person listed at two sites with two different phone numbers or emails keeps one contact.
  assert.deepEqual([...conflicts].sort(), ["CMPL13105", "CMPL6665", "CMPL8397"]);
});

test("edits in the masters flow into the rebuilt directory", () => {
  const masters = cdirMastersFromDirectory(data);
  const employee = masters[CDIR_MASTERS.employee].find((row) => row.empId === "CMPL1438");
  employee.status = "VACANT";
  employee.name = "";
  masters[CDIR_MASTERS.site].find((site) => site.name === "Hindustan Lalpeth OC").inRoster = "Yes";
  const rebuilt = cdirDirectoryFromMasters(masters);
  assert.equal(rebuilt.meta.totalVacant, data.meta.totalVacant + 1);
  assert.equal(rebuilt.sites.find((site) => site.label === "Hindustan Lalpeth OC").flag, null);
  // Rows that point at a removed site are left out rather than breaking the page.
  masters[CDIR_MASTERS.site] = masters[CDIR_MASTERS.site].filter((site) => site.name !== "Sasti OC");
  assert.equal(cdirDirectoryFromMasters(masters).meta.totalStaffSanctioned, data.meta.totalStaffSanctioned - data.siteTotals["sasti-oc"]);
});

test("dates, employee checks and cascades", () => {
  assert.deepEqual(cdirDate("1974-09-28"), { iso: "1974-09-28", display: "28-Sep-1974", month: 9, day: 28 });
  assert.equal(cdirDate("28-Sep-1974").iso, "1974-09-28");
  assert.equal(cdirDate("28/09/1974").iso, "1974-09-28");
  assert.equal(cdirDate("not a date").iso, "");
  const masters = { [CDIR_MASTERS.site]: [{ name: "Sasti OC" }], [CDIR_MASTERS.category]: [{ code: "A1" }] };
  assert.equal(cdirEmployeeError({ site: "Sasti OC", category: "A1", name: "X", status: "ACTIVE" }, masters), "");
  assert.equal(cdirEmployeeError({ site: "sasti oc", category: "a1", status: "VACANT" }, masters), "");
  assert.match(cdirEmployeeError({ site: "Unknown", category: "A1", name: "X" }, masters), /Site/);
  assert.match(cdirEmployeeError({ site: "Sasti OC", category: "Z9", name: "X" }, masters), /Category/);
  assert.match(cdirEmployeeError({ site: "Sasti OC", category: "A1", status: "ACTIVE" }, masters), /employee name/);
  assert.deepEqual(CDIR_CASCADES[CDIR_MASTERS.category].dependents, [[CDIR_MASTERS.employee, "category"], [CDIR_MASTERS.designation, "category"]]);
});

test("only Admin and Super Admin can see or change the C-Dir masters", () => {
  for (const name of CDIR_MASTER_NAMES) {
    assert.equal(isCdirMaster(name), true);
    assert.equal(masterAccessAllows({ adminLevel: "Admin", masterAccess: "Users & employees" }, name), true);
    assert.equal(masterAccessAllows({ adminLevel: "Super Admin" }, name), true);
    assert.equal(masterAccessAllows({ adminLevel: "Manager", masterAccess: name }, name), false);
  }
  assert.ok(server.includes("return req.session?.role==='super'&&normalizeAdminLevel(req.session?.permissions?.adminLevel)!=='Manager'"));
  assert.equal((server.match(/const cdirError=cdirWriteError\(req,master\);/g) || []).length, 5, "create, update, delete, delete selected and delete all");
  assert.ok(server.includes("const cdirInUse=isCdirMaster(master)?await cdirReferenceCount(master,deletedRecord):0;"));
  assert.ok(server.includes("const cascaded=isCdirMaster(master)?await cascadeCdirRename(master,previousRecord,storedRecord):0;"));
  assert.ok(server.includes("if(isCdirMaster(master))return cdirCleanRecord(master,record);"), "C-Dir sites are not rewritten to BDMS site names");
});

test("the directory is seeded once and C-Dir reads it live", () => {
  assert.ok(server.includes("await client.query(\"SELECT pg_advisory_xact_lock(hashtext('cdir-masters-seed'))\");"));
  assert.ok(server.includes("const CDIR_SEEDED_SETTING_KEY='cdir_masters_seeded';"));
  assert.ok(server.includes("app.get('/api/cdir/directory',requireSession"));
  assert.ok(server.includes("currentBirthdayNames(new Date(),{loadRoster:cdirDirectory})"));
  assert.match(html, /window\.cdirDirectoryReady = \(async function\(\)\{/);
  assert.match(html, /fetch\("\/api\/cdir\/directory"/);
  assert.match(html, /await window\.cdirDirectoryReady;\s*const DATA = JSON\.parse\(document\.getElementById\('directory-data'\)\.textContent\);/);
  for (const name of Object.values(CDIR_MASTERS)) assert.ok(source.includes(`[CDIR_MASTERS.${Object.keys(CDIR_MASTERS).find((key) => CDIR_MASTERS[key] === name)},`), name);
  assert.ok(source.includes("Object.assign(masterFields, CDIR_MASTER_FIELDS);"));
  assert.ok(source.includes('cdirFieldKind(type) ? <CDirFieldInput key={key} name={key} label={label} type={type} defaultValue={editing[key]}'));
});

test("small and capital letters are one value, saved in capitals", () => {
  const masters = cdirMastersFromDirectory(data);
  for (const [name, key] of [[CDIR_MASTERS.designation, "designation"], [CDIR_MASTERS.department, "department"]]) {
    const values = masters[name].map((record) => record[key]);
    assert.equal(new Set(values).size, values.length, name);
    assert.ok(values.every((value) => value === cdirCaps(value)), name);
  }
  assert.equal(masters[CDIR_MASTERS.designation].length, 199);
  assert.equal(masters[CDIR_MASTERS.department].length, 42);
  assert.equal(cdirCaps("  Store   manager "), "STORE MANAGER");
  assert.deepEqual(cdirNormalizeRecord(CDIR_MASTERS.employee, { name: "ram  singh", site: "Sasti OC", designation: "Mis incharge", department: "Store", category: "b1" }),
    { name: "RAM SINGH", site: "Sasti OC", designation: "MIS INCHARGE", department: "STORE", category: "B1", empId: "", reportingTo: "" });
  assert.deepEqual(cdirNormalizeRecord(CDIR_MASTERS.site, { name: "Sasti OC", region: "wcl" }), { name: "Sasti OC", region: "WCL" });
  assert.ok(server.includes("const cdirDuplicate=isCdirMaster(master)?await cdirDuplicateError(master,prepared):'';"));
  assert.ok(server.includes("const cdirDuplicate=isCdirMaster(master)?await cdirDuplicateError(master,[storedRecord],id):'';"));
  assert.ok(server.includes("if(isCdirMaster(master))return cdirCleanRecord(master,record);"));
});

test("C-Dir Masters opens a clock face of icons that show their full names", () => {
  const list = source.match(/const cdirMasterNavItems = \[[\s\S]*?\];/)?.[0] || "";
  for (const key of Object.keys(CDIR_MASTERS)) assert.ok(list.includes(`[CDIR_MASTERS.${key},`), key);
  assert.doesNotMatch(source.match(/const masterNav = \[[\s\S]*?\];/)[0], /CDIR_MASTERS/, "C-Dir masters are not listed flat");
  assert.ok(source.includes('<ClockMenu label="C-Dir Masters" centerLabel="C-Dir" icon={BookUser} items={cdirMasterNav} active={active} onSelect={selectMaster} />'));
  const clock = source.slice(source.indexOf("function ClockMenu("), source.indexOf("function Side("));
  assert.ok(clock.includes("aria-expanded={open}"));
  assert.ok(clock.includes('const clock = open && <div ref={clockRef} className={`cdir-clock${hours ? ` half ${inside ? "inside" : "beside"}` : ""}${down ? " down" : ""}`} role="menu" aria-label={label}>'));
  assert.ok(clock.includes('style={{"--angle": `${hours ? hours[index] * 30 : index * 360 / items.length}deg`}}'), "icons on a full clock or on given hours");
  assert.ok(clock.includes('onPointerEnter={(event) => { if (event.pointerType === "mouse") setOpen(true); }}'), "opens on hover");
  assert.ok(clock.includes("data-label={labelFor(name)}") && clock.includes("aria-label={labelFor(name)}"), "icons carry the full page name");
  assert.ok(clock.includes('<span className="workspace-menu-item cdir-clock-badge" data-workspace={keyFor(name, menuKey)} aria-hidden="true"><span className="workspace-icon"><Icon /><i className="workspace-icon-glow" /></span></span>'), "icons only, in the same coloured badges as the plain menus");
  assert.ok(clock.includes("const [openState, setOpen] = useState(() => items.some(([name]) => name === active));"), "opens by itself on one of its pages");
  assert.ok(clock.includes("if (rect && rect.right > window.innerWidth - 8) setInside(true);"), "a half clock that would leave the screen opens inside the menu");
  assert.ok(source.includes("[...masterNav, ...cdirMasterNavItems].some(([master]) => master === name)"), "C-Dir master pages stay reachable");
  const css = readFileSync(new URL("../src/topbar.css", import.meta.url), "utf8");
  assert.match(css, /\.cdir-clock-item \{[\s\S]*?transform: rotate\(var\(--angle\)\) translateY\(calc\(var\(--radius\) \* -1\)\) rotate\(calc\(var\(--angle\) \* -1\)\);/, "icons placed around a circle");
  assert.match(css, /\.cdir-clock-item::after \{\s*content: attr\(data-label\);/, "full name tooltip");
  assert.match(css, /\.cdir-clock-item:hover::after/);
  assert.match(css, /\.cdir-masters-hub\.open button\.cdir-masters-toggle,/, "entry is highlighted while open");
});

test("the Admin menu ends with a Database half clock for the backup pages and Diagnostics", () => {
  assert.ok(source.includes('const adminDatabaseNav = [...adminNav.filter(([name]) => backupAdminPages.has(name)), ["Diagnostics", Stethoscope], ["Storage management", HardDrive], ["Retention rules", CalendarClock], ["Purge data", Eraser]];'));
  assert.ok(source.includes("{adminNav.filter(([name])=>!backupAdminPages.has(name)).map(([name,Icon])=>"), "backup pages are not listed flat");
  const menu = source.slice(source.indexOf('className="masters-dropdown admin-dropdown"'), source.indexOf("{visibleNav.filter(([name]) => name === \"CD\")"));
  const locks = menu.indexOf('active === "Admin locks"'), database = menu.indexOf('<ClockMenu label="Database" icon={Database} items={adminDatabaseNav} hours={adminDatabaseNav.map((_, index, all) => (22.5 + index * 135 / Math.max(1, all.length - 1)) / 30)}');
  assert.ok(locks > 0 && database > locks, "Database is the last Admin entry, after Audit Trail and Admin locks");
  assert.ok(source.includes('if(backupAdminPages.has(name)||databaseToolPages.has(name))return isAdministrator;'), "backup pages and Diagnostics keep their Admin-only access");
  const css = readFileSync(new URL("../src/topbar.css", import.meta.url), "utf8");
  assert.match(css, /\.masters-dropdown \.cdir-clock\.half \{[\s\S]*?position: relative;/, "the half clock opens inside the menu, never off-screen");
});

test("Database opens beside the Admin menu and WhatsApp opens downward with WhatsApp in the centre", () => {
  const css = readFileSync(new URL("../src/topbar.css", import.meta.url), "utf8");
  assert.match(css, /\.cdir-clock\.half\.beside \{\s*top: 50%;\s*left: calc\(100% \+ 10px\);/, "Database half clock opens to the right");
  assert.match(css, /\.admin-dropdown:has\(\.cdir-clock\.half\.beside\) \{ max-height: none; overflow: visible; \}/, "the Admin menu does not clip it");
  assert.match(css, /\.cdir-clock\.half\.down \{\s*--cx: 50%;\s*--cy: 48px;/, "WhatsApp centre at the top middle");
  assert.ok(source.includes('<ClockMenu alwaysOpen down label="WhatsApp Integration" centerLabel="WhatsApp" items={visibleWhatsAppNav} hours={[3.6, 5.2, 6.8, 8.4, 6, 3].slice(0, visibleWhatsAppNav.length)}'));
  assert.ok(source.includes('onSelect={(page, event) => selectDropdownPage(page, event, setWhatsappSelectionClosed)}'), "choosing a WhatsApp page still closes the menu");
});
