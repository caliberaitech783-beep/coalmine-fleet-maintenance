import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');
const css=read('workspace-readability.css').replace(/\/\*[\s\S]*?\*\//g,'');
const client=read('main.jsx');
const compact=read('maintenance-mobile-compact.css');
const normalize=value=>value.replace(/\s+/g,' ').trim();
const blocks=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const rule=selector=>{
  const result=blocks.find(([,selectors])=>normalize(selectors).includes(normalize(selector).replace(/\s*\{$/,'')));
  assert.ok(result,`Missing readable workspace rule: ${selector}`);
  return result[2];
};
const mobile=css.slice(css.indexOf('@media screen and (max-width: 700px)'));
const dialog='.modal:not([class*="dashboard-"]):not(.director-timing-modal)';

test('operational readability loads after old compact styles but before the isolated dashboard overrides',()=>{
  const imports=[...client.matchAll(/import ["'](.+\.css)["'];/g)].map(match=>match[1]);
  assert.equal(imports.filter(path=>path==='./workspace-readability.css').length,1);
  assert.ok(imports.indexOf('./workspace-readability.css')>imports.indexOf('./maintenance-mobile-compact.css'));
  assert.deepEqual(imports.slice(-2),['./workspace-readability.css','./dashboard-readability.css']);
  for(const root of ['mobile-workspace','pagepanel','ticket-page','admin-lock-page']){
    assert.ok(client.includes(root),`Missing actual screen root: ${root}`);
    assert.ok(css.includes(`.${root}`),`Missing readable screen scope: ${root}`);
  }
  assert.doesNotMatch(css,/\.mine-dashboard|\.manager-dashboard/);
  assert.doesNotMatch(css,/(?:^|[}\n])\s*(?:html|body|:root|\.app|\.normal|\.panel)\s*(?:,|\{)/);
  for(const [,selectors] of blocks){
    if(selectors.includes('.normal'))assert.match(selectors,/\.mobile-workspace/);
    if(selectors.includes('.modal'))assert.ok(selectors.includes(dialog),'Generic modal rules must exclude dashboard dialogs');
  }
});

test('screen-only operational overrides preserve print styling and do not hide controls or scale the page',()=>{
  let depth=0,start=0,mediaCount=0;
  for(let index=0;index<css.length;index++){
    if(css[index]==='{'){
      if(depth===0){
        const outer=css.slice(start,index).trim();
        assert.match(outer,/^@media screen(?:\s|$)/,'Every override must be limited to screen media');
        assert.doesNotMatch(outer,/\bprint\b/);
        mediaCount++;
      }
      depth++;
    }else if(css[index]==='}'){
      depth--;
      assert.ok(depth>=0);
      if(depth===0)start=index+1;
    }
  }
  assert.equal(depth,0);
  assert.ok(mediaCount>=4);
  assert.equal(css.slice(start).trim(),'');
  assert.doesNotMatch(css,/\bzoom\s*:|\btransform\s*:\s*[^;{}]*scale/i);
  assert.doesNotMatch(css,/(?:^|[;{])\s*(?:overflow(?:-x)?\s*:\s*(?:hidden|clip)|display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none|content\s*:)/);
  assert.doesNotMatch(css,/data-mobile-open|\[hidden\]|\[disabled\]|\.hidden\b/);
  assert.match(compact,/\[data-mobile-open="false"\][\s\S]*?display:\s*none\s*!important/);
});

test('workspace text has a 16 pixel floor and readable controls without resizing checkbox or hidden fields',()=>{
  for(const [name,min] of [['copy',16],['label',18]]){
    const values=[...css.matchAll(new RegExp(`--workspace-${name}:\\s*(?:clamp\\()?([\\d.]+)px`,'g'))].map(match=>Number(match[1]));
    assert.ok(values.length,`Missing ${name} size token`);
    assert.ok(values.every(value=>value>=min));
  }
  assert.match(rule(':is(p, label, small, em, span, b, button, input, select, textarea, th, td, li, summary)'),/font-size:\s*var\(--workspace-copy\) !important/);
  const fields=rule(':is(input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea)');
  assert.match(fields,/font-size:\s*max\(16px, var\(--workspace-copy\)\) !important/);
  assert.match(fields,/min-height:\s*44px/);
  assert.match(fields,/max-width:\s*100%/);
});

test('mobile compact hero and tab caps are overridden without removing existing controls',()=>{
  assert.match(rule('.mobile-workspace .workspace-hero h1'),/font-size:\s*clamp\(26px,[^;]*!important/);
  assert.match(rule('.mobile-workspace .workspace-hero small'),/font-size:\s*var\(--workspace-copy\) !important/);
  const tabs=rule('.mobile-workspace .mobile-tabs button');
  assert.match(tabs,/font-size:\s*var\(--workspace-copy\) !important/);
  assert.match(tabs,/min-height:\s*44px !important/);
  assert.match(rule('.mobile-workspace .mobile-tabs {'),/flex-wrap:\s*wrap/);
  assert.match(rule('.mobile-workspace .sectiontitle'),/font-size:\s*clamp\(21px,[^;]*!important/);
  assert.match(mobile,/\.mobile-workspace \.mobile-tabs button\s*\{[^}]*flex:\s*1 1 135px/);
});

test('wide records remain in their own scroll containers while labels, filters and actions wrap',()=>{
  const tables=rule(':is(.scroll, .emptytable, .master-table-scroll, .ticket-table-wrap)');
  for(const pattern of [/min-width:\s*0/,/max-width:\s*100%/,/overflow:\s*auto/])assert.match(tables,pattern);
  assert.match(rule('.ticket-page :is(.ticket-page-head, .ticket-page-actions, .ticket-toolbar, .ticket-toolbar-controls)'),/flex-wrap:\s*wrap/);
  assert.match(rule('.mobile-workspace .row-actions button {'),/min-height:\s*40px/);
  assert.match(rule('.ticket-page .ticket-message'),/overflow-wrap:\s*anywhere/);
  assert.match(rule('.reports-page .report-category-copy {'),/min-width:\s*0;\s*overflow-wrap:\s*anywhere/);
  assert.match(rule('.reports-page .reports-category-tabs .report-category-copy small'),/white-space:\s*normal/);
  assert.match(rule('.reports-page .report-name-tabs button'),/white-space:\s*normal/);
  assert.match(mobile,/\.reports-page \.reports-category-tabs\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('workflow and report dialogs are scoped and reflow to single-column mobile forms',()=>{
  for(const scope of ['report-columns-dialog','report-sort-dialog','table-parameter-filter-popover','report-actions-popover','export-menu-popover','column-filter-popover']){
    assert.ok(client.includes(scope),`Missing actual portal class: ${scope}`);
    assert.ok(css.includes(`.${scope}`));
  }
  assert.match(rule(`${dialog} .formgrid {`),/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(rule(`${dialog} .form footer`),/flex-wrap:\s*wrap/);
  assert.match(rule(`${dialog} > header button`),/min-width:\s*44px;\s*flex-shrink:\s*0/);
  assert.match(mobile,/\.formgrid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(rule(':is(.report-actions-popover, .export-menu-popover) {'),/max-width:\s*calc\(100vw - 24px\)/);
  assert.match(rule(`:root[data-theme="dark"] ${dialog} .form label`),/color:\s*var\(--ink\)/);
  assert.match(rule(`:root[data-theme="dark"] ${dialog} .form small`),/color:\s*var\(--muted\)/);
});

test('narrow or short viewports preserve page scrolling without adding a vertical table trap',()=>{
  const adaptive=css.slice(css.indexOf('@media screen and (max-width: 900px), screen and (max-height: 760px)'),css.indexOf('@media screen and (max-width: 700px)'));
  assert.ok(adaptive.length,'Missing short-screen fallback');
  assert.match(adaptive,/\.normal:not\(\.embedded-workspace\):has\(\.mobile-workspace\)/);
  assert.match(adaptive,/> main:has\(\.mobile-workspace\)\s*\{[^}]*height:\s*auto;\s*overflow:\s*visible/);
  assert.match(adaptive,/\.mobile-workspace > section\.panel\s*\{[^}]*min-height:\s*0;\s*flex:\s*none/);
  assert.doesNotMatch(css,/\.mobile-workspace[^{}]*\.scroll[^{}]*\{[^}]*max-height:/);
});
