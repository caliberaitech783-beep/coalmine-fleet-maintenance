import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('Fleet Operation is the default and portals have explicit selectors',()=>{
  assert.match(source,/\[accountsPortal,setAccountsPortal\]=useState\(false\)/);
  assert.match(source,/aria-pressed=\{!accountsPortal\} onClick=\{\(\)=>selectLoginPortal\(false\)\}/);
  assert.match(source,/aria-pressed=\{accountsPortal\} onClick=\{\(\)=>selectLoginPortal\(true\)\}/);
  assert.match(source,/<strong>Fleet Operation<\/strong>/);
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
  assert.match(css,/height:auto;box-sizing:border-box;padding:12px;gap:8px;white-space:normal/);
  assert.match(css,/span\{min-width:0;overflow-wrap:anywhere\}/);
  assert.match(css,/@media\(max-width:360px\)\{.login-application-links\{grid-template-columns:minmax\(0,1fr\)\}\}/);
});

test('MIS opens its separate application in a new tab without adding HR',()=>{
  const links=source.match(/<div className="login-application-links">[\s\S]*?<\/div>/)?.[0];
  assert.ok(links);
  const mis=links.match(/<a className="login-mis-link"[\s\S]*?<\/a>/)?.[0];
  assert.ok(mis);
  assert.match(mis,/href="https:\/\/pulseII\.cmll\.in"/);
  assert.match(mis,/target="_blank"/);
  assert.match(mis,/rel="noopener noreferrer"/);
  assert.match(mis,/aria-label="Open MIS application in a new tab"/);
  assert.match(mis,/<strong>MIS<\/strong>/);
  assert.equal((links.match(/<a |<button /g)||[]).length,5);
  assert.doesNotMatch(links,/<strong>HR<\/strong>|login-hr-link/);
});
