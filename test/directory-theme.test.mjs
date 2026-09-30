import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../public/cd/directory-theme.js',import.meta.url),'utf8');
test('directory follows host theme live without navigation or data changes',()=>{
  const root={dataset:{},style:{}}, host={dataset:{theme:'dark'}};
  let changed, options;
  const window={parent:{document:{documentElement:host}},addEventListener(){}};
  vm.runInNewContext(script,{URLSearchParams,location:{search:''},document:{documentElement:root},window,localStorage:{getItem:()=> 'light'},MutationObserver:class {constructor(fn){changed=fn} observe(_,config){options=config}}});
  assert.equal(root.dataset.theme,'dark');
  host.dataset.theme='light'; changed();
  assert.equal(root.dataset.theme,'light');
  assert.equal(root.style.colorScheme,'light');
  assert.deepEqual(Array.from(options.attributeFilter),['data-theme','data-simple-mobile']);
  host.dataset.simpleMobile='true';changed();assert.equal(root.dataset.simpleMobile,'true');
});
test('directory dark palette is screen-only and uses the existing host preference',()=>{
  const css=readFileSync(new URL('../public/cd/directory-theme.css',import.meta.url),'utf8');
  const html=readFileSync(new URL('../public/cd/caliber-directory.html',import.meta.url),'utf8');
  assert.match(css,/@media screen/);
  assert.match(css,/--surface:/);
  assert.match(css,/\[data-theme="dark"\] table\.roster tbody tr:is\(:hover, :focus-within\) td \{ background: var\(--panel\); \}/);
  assert.match(html,/directory-theme.js/);
  assert.match(html,/background:var\(--surface, #fff\)/);
});
