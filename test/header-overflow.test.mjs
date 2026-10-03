import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('all profile navigation options wrap rather than clipping the last button',()=>{
  const css=read('src/topbar.css');
  assert.match(css,/\.normal-header-nav \{[^}]*flex-wrap: wrap;[^}]*overflow: visible/);
  assert.match(css,/\.app > aside nav \{[^}]*flex-wrap: wrap/);
  assert.match(css,/\.app > aside nav > \.masters-menu \{[^}]*flex: 0 0 auto/);
  assert.match(read('src/mobile-workflow.css'),/grid-template-columns: repeat\(auto-fit, minmax\(130px, 1fr\)\)/);
  assert.match(read('src/user-sessions.css'),/\.accounts-user-workspace > header nav\{[^}]*flex-wrap:wrap/);
});

test('wrapped admin and manager navigation reserves its actual height and cleans up',()=>{
  const source=read('src/main.jsx');
  const start=source.indexOf('  useEffect(() => {',source.indexOf('function Side('));
  const effect=source.slice(start,source.indexOf('  },[]);',start)+9);
  let height=76, callback, cleanup, disconnected=false;
  const properties=new Map();
  const header={getBoundingClientRect:()=>({height})};
  const document={getElementById:()=>header,documentElement:{style:{setProperty:(key,value)=>properties.set(key,value),removeProperty:key=>properties.delete(key)}}};
  class ResizeObserver {constructor(fn){callback=fn;}observe(element){assert.equal(element,header);}disconnect(){disconnected=true;}}
  new Function('useEffect','document','ResizeObserver',effect)(fn=>{cleanup=fn();},document,ResizeObserver);
  assert.equal(properties.get('--navigation-header-height'),'76px');
  height=124.2;callback();
  assert.equal(properties.get('--navigation-header-height'),'125px');
  cleanup();assert.equal(disconnected,true);assert.equal(properties.size,0);
});
