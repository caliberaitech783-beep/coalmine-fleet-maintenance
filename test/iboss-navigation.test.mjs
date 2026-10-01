import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const main=fs.readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('IBOSS follows C-Dir as a primary dropdown with all permitted reports',()=>{
 const cdir=main.indexOf('className={`masters-menu cdir-menu');
 const iboss=main.indexOf('className={`masters-menu iboss-menu');
 assert.ok(cdir>0&&iboss>cdir);
 assert.match(main,/data-nav="iboss" aria-haspopup="menu" aria-expanded=\{ibossOpen\}/);
 assert.match(main,/visibleIbossNav\.map\(\(\[name,Icon,workspace\]\) =>/);
 assert.match(main,/selectDropdownPage\(name,event,setIbossSelectionClosed\)/);
 assert.doesNotMatch(main,/<ClockMenu[^\n]+label="IBOSS"/);
 assert.match(main,/setIbossOpen\(false\)/);
 assert.match(main,/visibleIbossNav\.length > 0/);
});
