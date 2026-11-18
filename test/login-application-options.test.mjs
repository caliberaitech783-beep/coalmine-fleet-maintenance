import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('Fleet is the default and portals have explicit selectors',()=>{
  assert.match(source,/\[accountsPortal,setAccountsPortal\]=useState\(false\)/);
  assert.match(source,/aria-pressed=\{!accountsPortal&&!misPortal&&!dieselPortal\} onClick=\{\(\)=>selectLoginPortal\(false\)\}/);
  assert.match(source,/aria-pressed=\{accountsPortal\} onClick=\{\(\)=>selectLoginPortal\(true\)\}/);
  assert.match(source,/<strong>Fleet<\/strong>/);
  assert.match(source,/<strong>Accounts<\/strong>/);
});
test('Tender opens its application and Accident link is preserved',()=>{
  assert.match(source,/<a className="login-tender-link" href="https:\/\/tender.cmll.in" aria-label="Open Tender application"/);
  assert.doesNotMatch(source,/className="login-tender-link" disabled/);
  assert.match(source,/className="login-accident-link" href="https:\/\/bdms.cmll.in"/);
});

test('mobile application tiles wrap in two columns, with a single column on narrow phones',()=>{
  const css=readFileSync(new URL('../src/user-sessions.css',import.meta.url),'utf8');
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/padding:12px;gap:8px/);
  assert.match(css,/white-space:normal/);
  assert.match(css,/span\{min-width:0;overflow-wrap:anywhere\}/);
  assert.match(css,/@media\(max-width:360px\)\{.login-application-links\{grid-template-columns:minmax\(0,1fr\)\}\}/);
});

test('MIS and HR open the Pulse-II sign-in and workspace in the current tab',()=>{
 const links=source.split('<div className="login-application-links">')[1].split('</div>')[0];
 assert.ok(links.includes('https://pulse-ll.cmll.in/api/mis-credentials/start'));
 assert.ok(links.includes('<a className="login-hr-link" href="https://pulse-ll.cmll.in/hr/?signin=1">'));
 assert.doesNotMatch(links,/target="_blank"|hrpulse\.cmll\.in/);
});
