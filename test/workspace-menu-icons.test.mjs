import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const styles=readFileSync(new URL('../src/topbar.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('each Operational Workspaces entry is a keyed menu item with an icon badge',()=>{
  assert.match(source,/operationalWorkspaceNav\.map\(\(\[name, Icon, role\]\) => <div className="nav-config-row" key=\{name\}><button role="menuitem" className=\{`workspace-menu-item\$\{active === name \? " active" : ""\}`\} data-workspace=\{String\(role\)\.split\(" "\)\[0\]\.toLowerCase\(\)\}/);
  assert.match(source,/<span className="workspace-icon" aria-hidden="true"><Icon \/><i className="workspace-icon-glow" \/><\/span><span className="nav-label">\{name\}<\/span>/);
  assert.match(source,/\["Production workspace", Truck, "Production User"\],\s*\["Maintenance workspace", Wrench, "Maintenance User"\],\s*\["MIS workspace", ShieldCheck, "MIS User"\]/,'the data-workspace keys are production, maintenance and mis');
});

test('the three icons get their own gradient badge and animation, with reduced motion respected',()=>{
  for(const key of ['production','maintenance','mis'])assert.match(styles,new RegExp(`\\.workspace-menu-item\\[data-workspace="${key}"\\] \\.workspace-icon \\{ --ws-a: #[0-9a-f]{6}; --ws-b: #[0-9a-f]{6};`),key);
  assert.match(styles,/\.workspace-icon \{[\s\S]*background: linear-gradient\(135deg, var\(--ws-a\), var\(--ws-b\)\)/);
  assert.match(styles,/\[data-workspace="production"\]:hover \.workspace-icon svg[\s\S]*animation: ws-drive/);
  assert.match(styles,/\[data-workspace="maintenance"\]:hover \.workspace-icon svg[\s\S]*animation: ws-wrench/);
  assert.match(styles,/\[data-workspace="mis"\]:hover \.workspace-icon svg[\s\S]*animation: ws-shield/);
  assert.match(styles,/\.workspace-menu-item\.active \.workspace-icon-glow \{ animation: ws-ring/,'the active workspace keeps its glow ring');
  for(const name of ['ws-drive','ws-wrench','ws-shield','ws-ring'])assert.match(styles,new RegExp(`@keyframes ${name} \\{`),name);
  assert.match(styles,/button\.workspace-menu-item::before \{[\s\S]*translateX\(-120%\)/,'hover sheen');
  assert.match(styles,/@media \(prefers-reduced-motion: reduce\) \{\s*\.workspace-menu-item,[\s\S]*animation: none !important/);
});

test('the WhatsApp Integration menu uses the same badge markup with its own colours and animations',()=>{
  assert.match(source,/const whatsappMenuKey = \(name\) => \(\{ "Meta API setup": "setup", "Daily site-wise report": "site", "Daily OEM report": "oem", "WhatsApp alert history": "history" \}\)\[name\] \|\| "whatsapp";/);
  assert.match(source,/visibleWhatsAppNav\.map\(\(\[name, Icon\]\) => \(\s*<div className="nav-config-row" key=\{name\}><button role="menuitem" className=\{`workspace-menu-item\$\{active === name \? " active" : ""\}`\} data-workspace=\{whatsappMenuKey\(name\)\}/);
  assert.match(source,/<span className="workspace-icon" aria-hidden="true"><Icon \/><i className="workspace-icon-glow" \/><\/span><span className="nav-label">\{navigationLabel\(name\)\}<\/span>/);
  for(const key of ['setup','site','oem','history'])assert.match(styles,new RegExp(`\\.workspace-menu-item\\[data-workspace="${key}"\\] \\.workspace-icon \\{ --ws-a: #[0-9a-f]{6}; --ws-b: #[0-9a-f]{6};`),key);
  assert.match(styles,/\[data-workspace="setup"\]:hover \.workspace-icon svg[\s\S]*animation: ws-spin/);
  assert.match(styles,/\[data-workspace="site"\]:hover \.workspace-icon svg[\s\S]*animation: ws-rise/);
  assert.match(styles,/\[data-workspace="oem"\]:hover \.workspace-icon svg[\s\S]*animation: ws-shield/);
  assert.match(styles,/\[data-workspace="history"\]:hover \.workspace-icon svg[\s\S]*animation: ws-rewind/);
  for(const name of ['ws-spin','ws-rise','ws-rewind'])assert.match(styles,new RegExp(`@keyframes ${name} \\{`),name);
  assert.match(styles,/\.app > aside nav \.masters-dropdown button\.workspace-menu-item \{/,'the item styling is shared by every dropdown that uses the markup');
  assert.match(styles,/\.operational-workspaces-dropdown,\s*\.whatsapp-dropdown \{ min-width: 252px; padding: 8px; \}/);
});

test('the Masters menu carries its badge key inside the nav tuple and uses the same badge markup',()=>{
  const nav=source.match(/const masterNav = \[[\s\S]*?\];/)[0];
  const keys=[...nav.matchAll(/\["[^"]+", [A-Za-z0-9]+, "([a-z]+)"\]/g)].map(m=>m[1]);
  assert.deepEqual(keys,['users','equipment','breakdown','repair','subcategory','region','shift','delayed','transfers','hierarchy','oem']);
  assert.match(source,/visibleMasterNav\.map\(\(\[name, Icon, menuKey\]\) => \(\s*<div className="nav-config-row" key=\{name\}><button\s*role="menuitem"\s*className=\{`workspace-menu-item\$\{active === name \? " active" : ""\}`\}\s*data-workspace=\{menuKey \|\| "master"\}/);
  assert.match(source,/onClick=\{\(event\) => selectMaster\(name, event\)\}\s*>\s*<span className="workspace-icon" aria-hidden="true"><Icon \/><i className="workspace-icon-glow" \/><\/span>\s*<span className="nav-label">\{name\}<\/span>/);
  for(const key of keys.filter(key=>key!=='oem'))assert.match(styles,new RegExp(`\\.workspace-menu-item\\[data-workspace="${key}"\\] \\.workspace-icon \\{ --ws-a: #[0-9a-f]{6}; --ws-b: #[0-9a-f]{6};`),key);
  assert.match(styles,/\[data-workspace="equipment"\]:hover \.workspace-icon svg[\s\S]*animation: ws-drive/);
  assert.match(styles,/\[data-workspace="breakdown"\]:hover \.workspace-icon svg[\s\S]*animation: ws-wrench/);
  assert.match(styles,/\[data-workspace="shift"\]:hover \.workspace-icon svg[\s\S]*animation: ws-tick/);
  assert.match(styles,/\[data-workspace="transfers"\]:hover \.workspace-icon svg[\s\S]*animation: ws-shuttle/);
  for(const name of ['ws-tick','ws-shuttle'])assert.match(styles,new RegExp(`@keyframes ${name} \\{`),name);
  assert.match(styles,/\.masters-dropdown:has\(> \.nav-config-row > \.workspace-menu-item\),\s*\.operational-workspaces-dropdown,\s*\.whatsapp-dropdown \{ min-width: 252px; padding: 8px; \}/);
});

test('the Reports menu shows each category with its own icon in a badge keyed by category id',()=>{
  assert.match(source,/visibleReportNav\.map\(\(category\) => \{\s*const CategoryIcon = category\.icon \|\| FileBarChart;\s*return <div className="nav-config-row" key=\{category\.id\}><button\s*role="menuitem"\s*className=\{`workspace-menu-item\$\{active === "Reports" && activeReportCategory === category\.id \? " active" : ""\}`\}\s*data-workspace=\{`report-\$\{category\.id\}`\}/);
  assert.match(source,/<span className="workspace-icon" aria-hidden="true"><CategoryIcon \/><i className="workspace-icon-glow" \/><\/span>\s*<span className="nav-label">\{category\.label\}<\/span>/);
  assert.match(source,/\{id: "production", label: "Production report",[^\n]*icon: Gauge\}/,'the category icons feed the badges');
  for(const key of ['report-general','report-production','report-maintenance','report-mis'])assert.match(styles,new RegExp(`\\.workspace-menu-item\\[data-workspace="${key}"\\] \\.workspace-icon \\{ --ws-a: #[0-9a-f]{6}; --ws-b: #[0-9a-f]{6};`),key);
  assert.match(styles,/\[data-workspace="report-production"\]:hover \.workspace-icon svg[\s\S]*animation: ws-tick/);
  assert.match(styles,/\[data-workspace="report-maintenance"\]:hover \.workspace-icon svg[\s\S]*animation: ws-wrench/);
  assert.match(styles,/\.masters-dropdown:has\(> \.nav-config-row > \.workspace-menu-item\) \{ min-width: 262px !important; \}/,'badge menus override the narrow !important widths in style.css');
});

test('the Administration menu maps each entry to a badge key without changing the adminNav tuples',()=>{
  assert.match(source,/const adminMenuKeys = \{\s*"User Sessions": "sessions", "Access structure": "access", "Reporting structure": "reporting",\s*"Print helper": "print", "Request corrections": "corrections", "Recovery guide": "recovery",\s*"Backup": "backup", "Export Backup": "export", "Import Backup": "import", "Backup Schedule": "schedule",\s*"Audit Trail": "history", "Admin locks": "locks",\s*\};/);
  assert.match(source,/adminNav\.map\(\(\[name,Icon\]\)=><div className="nav-config-row" key=\{name\}><button role="menuitem" className=\{`workspace-menu-item\$\{active===name\?" active":""\}`\} data-workspace=\{adminMenuKeys\[name\] \|\| "admin"\}[^\n]*<span className="workspace-icon" aria-hidden="true"><Icon \/><i className="workspace-icon-glow" \/><\/span><span className="nav-label">\{name\}<\/span>/);
  assert.match(source,/data-workspace=\{adminMenuKeys\["Admin locks"\]\}[^\n]*<span className="workspace-icon" aria-hidden="true"><ShieldCheck \/><i className="workspace-icon-glow" \/><\/span><span className="nav-label">Admin locks<\/span>/);
  assert.match(source,/const adminNav = \[\n  \["User Sessions", UserRound\],\n  \["Access structure", Users\],/,'the tuples stay two elements: other tests pin them');
  for(const key of ['sessions','access','reporting','print','corrections','recovery','locks'])assert.match(styles,new RegExp(`\\.workspace-menu-item\\[data-workspace="${key}"\\] \\.workspace-icon \\{ --ws-a: #[0-9a-f]{6}; --ws-b: #[0-9a-f]{6};`),key);
  assert.match(styles,/\[data-workspace="print"\]:hover \.workspace-icon svg[\s\S]*animation: ws-press/);
  assert.match(styles,/\[data-workspace="export"\]:hover \.workspace-icon svg[\s\S]*animation: ws-drop/);
  assert.match(styles,/\[data-workspace="schedule"\]:hover \.workspace-icon svg[\s\S]*animation: ws-tick/);
  for(const name of ['ws-press','ws-drop'])assert.match(styles,new RegExp(`@keyframes ${name} \\{`),name);
});

test('the top-level header buttons get glass badges in the header gradient tones with a sliding underline and sheen',()=>{
  assert.equal((source.match(/className=\{`header-nav-item\$\{active === n \? " active" : ""\}`\}\s*data-nav=\{n\.toLowerCase\(\)\}[\s\S]*?<span className="header-nav-icon" aria-hidden="true"><I \/><\/span>\s*<span className="nav-label">\{n\}<\/span>/g)||[]).length,2,'direct top-level nav render loops');
  for(const [key,icon,label] of [['masters','Menu','Masters'],['whatsapp','MessageCircle','WhatsApp Integration'],['workspaces','Users','Operational Workspaces'],['reports','FileBarChart','Reports']]){
    assert.match(source,new RegExp(`data-nav="${key}"[\\s\\S]*?<span className="header-nav-icon" aria-hidden="true"><${icon} \\/><\\/span>\\s*<span className="nav-label">${label}<\\/span>`),key);
  }
  assert.match(source,/data-nav="admin"[^\n]*<span className="header-nav-icon" aria-hidden="true"><ShieldCheck \/><\/span><span className="nav-label">Admin<\/span>/);
  assert.match(source,/data-nav="manager"[^\n]*<UserRound \/>/);
  assert.match(source,/data-nav="correction"[^\n]*<Pencil \/>/);
  assert.match(source,/data-nav="approvals"[^\n]*<ShieldCheck \/>/);
  assert.match(styles,/\.app > aside nav button\.header-nav-item::before \{[\s\S]*translateX\(-130%\)/,'sheen drags across the button');
  assert.match(styles,/\.app > aside nav button\.header-nav-item::after \{[\s\S]*transform: scaleX\(0\);\s*transform-origin: left center;/,'underline slides in from the left');
  assert.match(styles,/\.header-nav-icon \{[\s\S]*background: linear-gradient\(135deg, var\(--hn-a, #8b5cf6\), var\(--hn-b, #522e90\)\)/);
  assert.match(styles,/\.header-nav-item\[data-nav="dashboard"\] \{ --hn-a: #8b5cf6; --hn-b: #522e90;/,'leftmost button uses the header purple');
  assert.match(styles,/\.header-nav-item\[data-nav="cd"\] \{ --hn-a: #7c3aed; --hn-b: #2563eb;/,'CD gets its own main menu badge');
  assert.doesNotMatch(source,/visibleNav = nav\.filter\(\(\[name\]\) => name==="CD" \|\|/,'CD is no longer forced into navigation');
  assert.doesNotMatch(source,/if\(name==="CD"\)return true;/,'CD uses the same saved-menu guard as other optional pages');
  assert.match(styles,/\.header-nav-item\[data-nav="admin"\] \{ --hn-a: #f97373; --hn-b: #f04e53;/,'rightmost button uses the header coral');
  for(const key of ['cd','masters','whatsapp','workspaces','reports','tickets','manager','correction','approvals'])assert.match(styles,new RegExp(`\\.header-nav-item\\[data-nav="${key}"\\][^{]*\\{ --hn-a: #[0-9a-f]{6}; --hn-b: #[0-9a-f]{6};`),key);
  assert.match(styles,/\[data-nav="tickets"\]:hover \.header-nav-icon svg[^{]*\{ animation: ws-tick/);
  assert.match(styles,/\[data-nav="masters"\]:hover \.header-nav-icon svg[^{]*\{ animation: ws-shuttle/);
  assert.match(styles,/button > svg:first-child \{\s*display: none;\s*\}\s*\.app > aside nav > \.nav-config-row > button > \.header-nav-icon,\s*\.app > aside nav > \.masters-menu > \.nav-config-row > button > \.header-nav-icon \{\s*display: none;\s*\}/,'mid-width layout still hides the header icons');
  assert.match(styles,/@media \(prefers-reduced-motion: reduce\) \{\s*\.app > aside nav button\.header-nav-item,/);
});

test('operational, manager and workspace navigation get the graphical treatment through data-nav attributes only',()=>{
  const motion=readFileSync(new URL('../src/nav-motion.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const header=source.slice(source.indexOf('<nav className="normal-header-nav">'),source.indexOf('</nav>',source.indexOf('<nav className="normal-header-nav">')));
  for(const [key,icon,label] of [['dashboard','LayoutDashboard',' Dashboard'],['directory','BookOpen',' Directory \\(CD\\)'],['reports','FileBarChart',' Reports'],['tickets','Ticket',' Tickets'],['transfers','ArrowRightLeft',' Vehicle Transfer']]){
    assert.match(header,new RegExp(`<button data-nav="${key}" className=\\{section === "[a-z]+" \\? "active" : ""\\}[\\s\\S]*?><${icon} \\/>${label}<\\/button>`),`${key} keeps the plain icon + label shape`);
  }
  assert.match(header,/<button data-nav="requests" className=\{section === "profile" \? "active" : ""\}[\s\S]*?><Wrench \/> \{isGeneral \? "Requests" : mobileRole\}<\/button>/);
  const tabs=source.slice(source.indexOf('<div className="mobile-tabs" role="tablist">'),source.indexOf('</div>\n      </div>',source.indexOf('<div className="mobile-tabs" role="tablist">')));
  for(const key of ['requests','create','productionFirstTrip','verify','history','idle','close'])assert.match(tabs,new RegExp(`<button data-nav="${key}" `),key);
  assert.match(tabs,/>Requests<\/button>/,'tab text unchanged');
  assert.match(source,/const createLockedByFirstTrip=isProductionManager&&productionFirstTripRows\.length>0/,'only Production Managers lock request creation while first trips are pending');
  assert.match(source,/const productionFirstTripRows=useMemo\(\(\)=>productionFirstTripSourceRows\.filter\(isProductionFirstTripPending\),\[productionFirstTripSourceRows\]\);/,'first trip tabs use the site-wide production pending queue');
  assert.match(source,/className=\{`primary\$\{createLockedByFirstTrip\?" create-locked-by-first-trip":""\}`\}/,'create button carries the manager-only locked state');
  assert.match(source,/first-trip-pending-tab first-trip-pending-alert/,'first trip tab flashes while pending');
  const manager=source.match(/<div className="mobile-tabs manager-queue-tabs"[\s\S]*?<\/div>/)[0];
  for(const key of ['active','idle','productionFirstTrip','history'])assert.match(manager,new RegExp(`<button data-nav="${key}" `),key);
  assert.match(source,/<button type="button" key=\{role\} data-nav="role" className=\{activeManagerRole===role\?"active":""\}/);
  const imports=[...source.matchAll(/import ["'](.+\.css)["'];/g)].map(m=>m[1]);
  assert.ok(imports.indexOf('./nav-motion.css')>imports.indexOf('./brand-theme.css')&&imports.indexOf('./nav-motion.css')<imports.indexOf('./workspace-readability.css'),'loaded after the brand theme, before the pinned last five');
  assert.match(motion,/\.normal-header-nav button\[data-nav\] > svg:first-child \{[\s\S]*background: linear-gradient\(135deg, var\(--hn-a, #8b5cf6\), var\(--hn-b, #522e90\)\)/,'the icon itself is the badge');
  assert.match(motion,/\.normal-header-nav button\[data-nav="dashboard"\] \{ --hn-a: #8b5cf6; --hn-b: #522e90;/);
  assert.match(motion,/\.normal-header-nav button\[data-nav="transfers"\] \{ --hn-a: #f97373; --hn-b: #f04e53;/);
  assert.match(motion,/\.normal-header-nav button\[data-nav\]::after \{[\s\S]*transform: scaleX\(0\);\s*transform-origin: left center;/);
  assert.match(motion,/\.mobile-tabs button\[data-nav\]::before \{[\s\S]*border-radius: 50%;/,'tabs get a colour dot');
  for(const key of ['requests','create','productionFirstTrip','verify','history','idle','close','role'])assert.match(motion,new RegExp(`\\.mobile-tabs button\\[data-nav="${key}"\\][^{]*\\{ --tab-a: #[0-9a-f]{6}; --tab-b: #[0-9a-f]{6};`),key);
  for(const name of ['hn-pulse','hn-wiggle','hn-press','hn-tick','hn-shuttle','hn-dot'])assert.match(motion,new RegExp(`@keyframes ${name} \\{`),name);
  assert.match(motion,/@media \(prefers-reduced-motion: reduce\)/);
});

test('the Vehicle Transfer header button gets the same glass badge as its neighbours',()=>{
  assert.match(source,/vehicleTransferDirectAccess&&<div className="nav-config-row"><button className=\{`header-nav-item\$\{active==="Vehicle transfers"\?" active":""\}`\} data-nav="transfers"[^\n]*<span className="header-nav-icon" aria-hidden="true"><ArrowRightLeft \/><\/span><span className="nav-label">Vehicle Transfer<\/span>/);
  assert.match(styles,/\.header-nav-item\[data-nav="transfers"\] \{ --hn-a: #fb923c; --hn-b: #ea580c;/);
  assert.match(styles,/\[data-nav="transfers"\]:hover \.header-nav-icon svg[^{]*\{ animation: ws-shuttle/);
});
