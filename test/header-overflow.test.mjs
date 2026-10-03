import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('all profile navigation options wrap rather than clipping the last button',()=>{
  const css=read('src/topbar.css');
  assert.match(css,/\.normal-header-nav \{[^}]*flex-wrap: wrap;[^}]*overflow: visible/);
  assert.match(css,/\.app > aside nav \{[^}]*flex-wrap: wrap/);
  assert.match(css,/\.app > aside nav > \.masters-menu \{[^}]*flex: 0 0 auto/);
  assert.match(css,/\.app > aside nav > \.masters-menu > \.nav-config-row > button \{[^}]*overflow: hidden/);
  assert.match(read('src/mobile-workflow.css'),/grid-template-columns: repeat\(auto-fit, minmax\(130px, 1fr\)\)/);
  assert.match(read('src/user-sessions.css'),/\.accounts-user-workspace > header nav\{[^}]*flex-wrap:wrap/);
});

test('header shine is removed and top-level menu text is enlarged at every breakpoint',()=>{
  const css=read('src/topbar.css');
  assert.match(css,/\.normal > header \.normal-header-nav > button\[data-nav\]::before \{\s*content: none;\s*animation: none;\s*transition: none;/);
  for(const size of [18,16,14])assert.ok(css.includes(`--navigation-label-size: ${size}px`));
  assert.match(css,/\.app > #admin-primary-navigation > nav > button,[\s\S]*?font-size: var\(--navigation-label-size\)/);
});

test('wrapped admin and manager navigation reserves its actual height and cleans up',()=>{
  const source=read('src/main.jsx');
  const start=source.indexOf('  useEffect(() => {',source.indexOf('function Side('));
  const effect=source.slice(start,source.indexOf('  },[]);',start)+9);
  let height=76, callback, cleanup, disconnected=false,writes=0,reads=0;
  const properties=new Map();
  const header={getBoundingClientRect:()=>{reads++;return {height};}};
  const document={getElementById:()=>header,documentElement:{style:{setProperty:(key,value)=>{writes++;properties.set(key,value);},removeProperty:key=>properties.delete(key)}}};
  class ResizeObserver {constructor(fn){callback=fn;}observe(element){assert.equal(element,header);}disconnect(){disconnected=true;}}
  new Function('useEffect','document','ResizeObserver',effect)(fn=>{cleanup=fn();},document,ResizeObserver);
  assert.equal(properties.get('--navigation-header-height'),'76px');
  callback([{borderBoxSize:[{blockSize:76}]}]);
  callback([{borderBoxSize:[{blockSize:76}]}]);
  assert.equal(writes,1,'unchanged header size must not invalidate page styles');
  assert.equal(reads,1,'observer measurements must not force additional layout reads');
  height=124.2;callback();
  assert.equal(properties.get('--navigation-header-height'),'125px');
  cleanup();assert.equal(disconnected,true);assert.equal(properties.size,0);
});
