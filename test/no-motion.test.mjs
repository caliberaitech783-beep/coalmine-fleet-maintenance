import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const main=read('../src/main.jsx');
const noMotion=read('../src/no-motion.css');
const recordBrowser=read('../src/dashboard-record-browser.jsx');
const icons=read('../src/motion-icons.jsx');
const directory=read('../public/cd/caliber-directory.html');

test('the application permanently resolves CSS motion without changing component styling',()=>{
  assert.match(main,/import "\.\/dashboard-night\.css";\nimport "\.\/no-motion\.css";/,'the no-motion layer loads after the application styles');
  assert.match(noMotion,/:root \*,\n:root \*::before,\n:root \*::after \{/);
  assert.match(noMotion,/animation-duration: 0s !important;/);
  assert.match(noMotion,/animation-iteration-count: 1 !important;/);
  assert.match(noMotion,/transition-duration: 0s !important;/);
  assert.match(noMotion,/scroll-behavior: auto !important;/);
});

test('programmatic scrolling and SVG icons contain no independent animation',()=>{
  assert.doesNotMatch(main,/behavior:\s*["']smooth["']/);
  assert.doesNotMatch(recordBrowser,/behavior:\s*["']smooth["']/);
  assert.doesNotMatch(icons,/<animate(?:Motion|Transform)?\b/);
});

test('the standalone directory follows the same no-motion policy',()=>{
  assert.match(directory,/:root \*,:root \*::before,:root \*::after\{/);
  assert.match(directory,/animation-duration:0s!important/);
  assert.match(directory,/transition-duration:0s!important/);
  assert.match(directory,/\.reveal,\.reveal\.in-view\{opacity:1!important;transform:none!important;\}/);
  assert.doesNotMatch(directory,/behavior:\s*['"]smooth['"]/);
});
