import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {SITE_COORDINATES,DEFAULT_COORDINATES} from '../src/site-coordinates.mjs';

// Owner, 23 Nov 2026: "remove the temperature sign from all the websites. I don't require that."
// The top bar and the Help & Training window show no temperature, and the screen no longer calls a weather service.
const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const main=read('../src/main.jsx');
const dialog=read('../src/help-training.jsx');
const dialogStyles=read('../src/help-training.css');

test('the top bar goes from the clock straight to the Day / Night switch, with no temperature chip',()=>{
  assert.match(main,/<HeaderClock \/>\s*<div>\s*<ThemeToggle theme=\{theme\} onToggle=\{toggleTheme\} \/>/);
  assert.doesNotMatch(main,/LiveTemperatureChip|live-temperature/);
});

test('the Help & Training window opens on its icon, with no temperature before it',()=>{
  assert.match(dialog,/export default function HelpTraining\(\{role = "", roles = \[\]\}\)/);
  assert.match(dialog,/<span className="help-training-heading-lead">\s*<span className="help-training-heading-icon"><CircleHelp \/><\/span>\s*<\/span>/);
  assert.doesNotMatch(dialog,/temperature|weather/i);
  assert.doesNotMatch(dialogStyles,/temperature|weather/i);
  assert.match(dialogStyles,/\.help-training-dialog>header\{grid-template-columns:auto minmax\(0,1fr\) auto 40px\}/);
  assert.match(dialogStyles,/\.help-training-dialog \.help-training-heading-icon\{[^}]*background:linear-gradient\(135deg,#a855f7,#6b2fa8\);[^}]*animation:help-bob 2\.8s ease-in-out infinite\}/,'same badge as the header trigger');
  assert.match(dialogStyles,/\.help-training-dialog \.help-training-heading-icon svg\{[^}]*animation:help-nod 2\.8s ease-in-out infinite\}/);
});

test('no screen file carries the chip or calls a weather service',()=>{
  for(const gone of ['live-temperature-chip.jsx','live-temperature-chip.css','live-temperature.mjs'])assert.equal(existsSync(new URL(`../src/${gone}`,import.meta.url)),false,gone);
  const sources=readdirSync(new URL('../src/',import.meta.url)).filter(name=>/\.(jsx?|mjs|css)$/.test(name));
  assert.ok(sources.length>100,'reads the screen sources');
  for(const name of sources){
    const text=read(`../src/${name}`);
    assert.doesNotMatch(text,/open-meteo|live-temperature|LiveTemperature|help-training-weather/,name);
  }
});

test('the site coordinates the sign-in location needs are kept',()=>{
  assert.equal(Object.keys(SITE_COORDINATES).length,8);
  assert.equal(SITE_COORDINATES['jayant ob'].place,'Jayant, Singrauli');
  assert.equal(DEFAULT_COORDINATES.place,'Nagpur');
  assert.match(read('../src/sign-in-location.mjs'),/import \{SITE_COORDINATES, DEFAULT_COORDINATES\} from "\.\/site-coordinates\.mjs";/);
});
