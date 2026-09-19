import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL(path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const chip=read('../src/live-temperature-chip.jsx');
const styles=read('../src/live-temperature-chip.css');
const main=read('../src/main.jsx');

test('the admin header (Admin, Super Admin, Manager) shows the live temperature chip next to the theme switch',()=>{
  assert.match(main,/import LiveTemperatureChip from "\.\/live-temperature-chip\.jsx";/);
  assert.match(main,/<HeaderClock \/>\s*<div>\s*<LiveTemperatureChip location=\{profileLocation\} \/>\s*<ThemeToggle theme=\{theme\} onToggle=\{toggleTheme\} \/>/);
  assert.equal((main.match(/<LiveTemperatureChip /g)||[]).length,1);
});

test('the chip polls every ten minutes, reads "(37°C) 98.6°F" and degrades to dashes',()=>{
  assert.match(chip,/export function useLiveTemperature\(site, active = true\)/);
  assert.match(chip,/const timer = setInterval\(load, TEMPERATURE_REFRESH_MS\);/);
  assert.match(chip,/controller\.abort\(\); clearInterval\(timer\);/,'stops polling on unmount');
  assert.match(chip,/<span className=\{`live-temperature-chip\$\{state\} \$\{className\}`\.trim\(\)\} role="status" aria-live="polite" title=\{temperatureChipTitle\(reading\)\}>\s*<Thermometer aria-hidden="true" \/>\s*<b>\{formatTemperature\(reading\.celsius\)\}<\/b>/);
  assert.match(chip,/reading\.error \? " is-error" : Number\.isFinite\(reading\.celsius\) \? "" : " is-loading"/);
  assert.match(styles,/\.live-temperature-chip\{[^}]*font-variant-numeric:tabular-nums;/);
  assert.match(styles,/\.live-temperature-chip::after\{[^}]*animation:live-temperature-live 1\.6s ease-out infinite\}/,'live dot');
  assert.match(styles,/\.live-temperature-chip\.is-error\{[^}]*color:#6b7891\}/);
  assert.match(styles,/:root\[data-theme="dark"\] \.live-temperature-chip\{/,'night mode variant');
  assert.match(styles,/@media \(prefers-reduced-motion:reduce\)/);
});
