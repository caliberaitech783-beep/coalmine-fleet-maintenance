import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('Fleet is the default and portals have explicit selectors',()=>{
  assert.match(source,/\[accountsPortal,setAccountsPortal\]=useState\(false\)/);
  assert.match(source,/aria-pressed=\{!accountsPortal&&!misPortal&&!hrPortal&&!dieselPortal\} onClick=\{\(\)=>selectLoginPortal\(false\)\}/);
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

test('MIS keeps its handoff while HR opens inside Pulse',()=>{
 const links=source.match(/<div className="login-application-links">[\s\S]*?<\/div>/)?.[0];
 assert.ok(links);assert.match(links,/className="login-mis-link"/);assert.ok(links.includes('https://pulse-ll.cmll.in/api/mis-credentials/start'));assert.match(links,/<strong>MIS<\/strong>/);assert.match(links, /<button type="button" className="login-hr-link" aria-pressed=\{hrPortal\}/);
 assert.match(source, /<iframe[\s\S]*?title="Caliber HR"[\s\S]*?embedded=pulse/);
 assert.match(source, /event\.origin !== hrWorkspaceOrigin \|\| event\.source !== frame\.contentWindow/);
});

test('Diesel selects the existing credentials form and keeps the Pulse handoff in the same tab', () => {
  assert.ok(source.includes('aria-pressed={dieselPortal}'));
  assert.ok(source.includes("query.get('dieselSignIn') === '1'"));
  assert.ok(source.includes("window.location.assign('https://pulse-lll.cmll.in/api/sign-in/start')"));
  assert.ok(source.includes("dieselPortal?'Diesel sign in'"));
  assert.ok(source.includes("'Username is required.' : 'Password is required.'"));
  assert.doesNotMatch(source, /<a className="login-diesel-link"/);
});
