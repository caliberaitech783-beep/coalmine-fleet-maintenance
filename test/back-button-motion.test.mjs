import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const css=readFileSync(new URL('../src/back-button-motion.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('every back button gets the graphical badge: crumb page back, modal back arrows, hourly breakdown back',()=>{
  const imports=[...source.matchAll(/import ["'](.+\.css)["'];/g)].map(m=>m[1]);
  assert.ok(imports.indexOf('./back-button-motion.css')>imports.indexOf('./user-sessions.css')&&imports.indexOf('./back-button-motion.css')<imports.indexOf('./workspace-readability.css'),'after the modal back base styles, before the pinned last five');
  assert.match(source,/className="page-back"/,'admin crumb back button');
  assert.ok((source.match(/className="modal-back-button"/g)||[]).length>=4,'modal headers');
  assert.match(css,/\.crumb \.page-back,\s*\.modal-back-button \{[^}]*background: linear-gradient\(135deg, #a855f7, #6b2fa8\) !important;/);
  assert.match(css,/\.crumb \.page-back > svg,\s*\.modal-back-button > span \{[^}]*animation: back-nudge 3\.2s ease-in-out infinite;/,'the arrow nudges left every few seconds');
  assert.match(css,/:hover > svg[^{]*\{ animation: none; transform: translateX\(-3px\); \}/,'hover slides the arrow left');
  assert.match(css,/\.crumb \.page-back::before,\s*\.modal-back-button::before \{[^}]*background: linear-gradient\(90deg, #ffffffe6, transparent\);/,'motion trail');
  assert.match(css,/:hover::after[^{]*\{ animation: back-ring 1\.2s ease-out infinite; \}/,'ripple ring');
  assert.match(css,/\.crumb \.page-back:disabled \{ background: #e6e9f0 !important;[^}]*cursor: default; \}/,'no previous page stays muted');
  assert.match(css,/\.dashboard-breakdown-day-back \{[^}]*border-radius: 999px !important;[^}]*background: linear-gradient\(135deg, #a855f7, #6b2fa8\) !important;/);
  for(const name of ['back-nudge','back-ring'])assert.match(css,new RegExp(`@keyframes ${name} \\{`),name);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
});
