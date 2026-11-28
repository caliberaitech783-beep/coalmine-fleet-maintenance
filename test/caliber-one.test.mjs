import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APPS,appByKey,initialKey,frameAllow,keyFromShortcut,preloadOrder} from '../public/one/one-tabs.mjs';

// Caliber One (owner, 28 Nov 2026): pulse.cmll.in/one is one installable window with Pulse, Pulse-II MIS,
// HR Pulse and Diesel as tabs along the top. Each tab keeps its website loaded, so switching is instant.
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('Caliber One has the four Caliber websites as tabs, in this order',()=>{
  assert.deepEqual(APPS.map(app=>[app.key,app.label,app.url]),[
    ['pulse','Pulse','https://pulse.cmll.in/'],
    ['mis','Pulse-II MIS','https://pulse-ll.cmll.in/'],
    ['hr','HR Pulse','https://hrpulse.cmll.in/'],
    ['diesel','Diesel','https://pulse-lll.cmll.in/'],
  ]);
  assert.equal(appByKey('hr').short,'HR');
  assert.equal(appByKey('unknown'),null);
});

test('the tab in the address wins, then the tab used last, then Pulse',()=>{
  assert.equal(initialKey({hash:'#mis',saved:'hr'}),'mis');
  assert.equal(initialKey({hash:'#DIESEL'}),'diesel');
  assert.equal(initialKey({hash:'#nothing',saved:'hr'}),'hr');
  assert.equal(initialKey({hash:'',saved:'gone'}),'pulse');
  assert.equal(initialKey(),'pulse');
});

test('camera, microphone, location and clipboard are handed to the Caliber websites only',()=>{
  const allow=frameAllow();
  for(const feature of ['camera','microphone','geolocation','clipboard-read','clipboard-write','fullscreen']){
    assert.ok(allow.includes(`${feature} https://pulse.cmll.in https://pulse-ll.cmll.in https://hrpulse.cmll.in https://pulse-lll.cmll.in`),feature);
  }
  assert.doesNotMatch(allow,/\*/,'never every website');
});

test('Ctrl+1 to Ctrl+4 pick a tab and Ctrl+PageDown / PageUp move along',()=>{
  assert.equal(keyFromShortcut({ctrlKey:true,key:'2'},'pulse'),'mis');
  assert.equal(keyFromShortcut({ctrlKey:true,key:'4'},'pulse'),'diesel');
  assert.equal(keyFromShortcut({ctrlKey:true,key:'9'},'pulse'),null);
  assert.equal(keyFromShortcut({ctrlKey:true,key:'PageDown'},'diesel'),'pulse');
  assert.equal(keyFromShortcut({ctrlKey:true,key:'PageUp'},'pulse'),'diesel');
  assert.equal(keyFromShortcut({key:'2'},'pulse'),null,'a plain digit is typing, not a shortcut');
  assert.equal(keyFromShortcut({ctrlKey:true,altKey:true,key:'2'},'pulse'),null);
});

test('the other tabs load one after another behind the open one',()=>{
  assert.deepEqual(preloadOrder('pulse'),['mis','hr','diesel']);
  assert.deepEqual(preloadOrder('hr'),['diesel','pulse','mis']);
});

test('the page installs as its own app, keeps no inline script and has no motion',()=>{
  const page=read('../public/one/index.html');
  const manifest=JSON.parse(read('../public/one/manifest.webmanifest'));
  const style=read('../public/one/one.css');
  const script=read('../public/one/one.js');
  assert.match(page,/<link rel="manifest" href="\/one\/manifest\.webmanifest"\/>/);
  assert.match(page,/<script type="module" src="\/one\/one\.js"><\/script>/);
  assert.doesNotMatch(page,/<script>(?!\s*<\/script>)/,'no inline script');
  assert.deepEqual([manifest.id,manifest.start_url,manifest.scope,manifest.display,manifest.short_name],['/one/','/one/','/one/','standalone','Caliber One']);
  assert.match(style,/:root \*, :root \*::before, :root \*::after \{ animation-duration: 0s !important; transition-duration: 0s !important;/);
  assert.match(style,/\.one-frame \{[^}]*visibility: hidden;/,'closed tabs stay loaded at full size');
  assert.match(script,/if \(window\.self !== window\.top\) \{\n  window\.location\.replace\('\/'\);/,'Caliber One never opens inside one of its own tabs');
  assert.doesNotMatch(script,/sandbox/,'a sandbox would stop sign-in and downloads');
});
