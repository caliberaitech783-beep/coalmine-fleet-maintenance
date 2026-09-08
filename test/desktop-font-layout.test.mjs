import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const css=readFileSync(new URL('../src/workspace-readability.css',import.meta.url),'utf8');
const rules=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const rule=selector=>{
  const found=rules.find(([,value])=>value.trim()===selector);
  assert.ok(found,`Missing rule: ${selector}`);
  return found[2];
};
const roots=':is(.mobile-workspace, .pagepanel, .ticket-page, .admin-lock-page)';

test('master and workflow actions retain intrinsic table width at every font size',()=>{
  const cell=rule(`${roots} td.row-actions`);
  for(const expected of [/display:\s*table-cell/,/vertical-align:\s*middle/,/width:\s*1%/,/min-width:\s*0/,/white-space:\s*nowrap/])assert.match(cell,expected);
  const button=rule(`${roots} .row-actions > button`);
  for(const expected of [/flex:\s*0 0 auto/,/white-space:\s*nowrap/,/overflow-wrap:\s*normal/,/word-break:\s*normal/])assert.match(button,expected);
  assert.match(rule(`${roots} td.row-actions > button + button`),/margin-inline-start:\s*8px/);
  assert.match(rule(`${roots} button > svg`),/flex-shrink:\s*0/);
});

test('operational button defaults cannot break action words into individual letters',()=>{
  const buttons=rules.find(([,selectors])=>selectors.includes(`${roots} button,`));
  assert.ok(buttons);
  assert.match(buttons[2],/overflow-wrap:\s*normal/);
  assert.match(buttons[2],/word-break:\s*normal/);
  assert.doesNotMatch(buttons[2],/anywhere|break-all|break-word/);
  // Long report names and filter values keep their separate wrapping rules.
  assert.match(css,/\.reports-page \.report-name-tabs button\s*\{[^}]*white-space:\s*normal/);
  assert.match(css,/\.column-filter-popover :is\([^}]+overflow-wrap:\s*anywhere/);
});

test('mobile stacked search controls do not inherit a 220px tall flex basis',()=>{
  const mobile=css.slice(css.indexOf('@media screen and (max-width: 700px)'));
  assert.match(mobile,/:is\(\.mobile-workspace, \.pagepanel\) \.table-search-toolbar label\s*\{\s*flex:\s*0 1 auto;\s*width:\s*100%/);
  assert.match(rule('.pagepanel .toolbar > div:first-child:not(.toolbar-actions-end)'),/min-width:\s*0;\s*flex:\s*1 1 220px/);
  assert.match(rule(':is(.mobile-workspace, .pagepanel) .toolbar-actions-end'),/flex-wrap:\s*wrap;\s*max-width:\s*100%/);
});

test('report filter wrappers grow with readable form controls',()=>{
  assert.match(rule('.reports-page .report-table-filter-toolbar > label'),/height:\s*auto;\s*min-height:\s*44px/);
  assert.match(css,/font-size:\s*max\(16px, var\(--workspace-copy\)\) !important/);
  assert.match(css,/--workspace-copy:\s*clamp\(13px, \.3vw \+ 9px, 15px\)/);
});
