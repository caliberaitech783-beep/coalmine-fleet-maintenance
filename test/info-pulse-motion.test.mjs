import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pulse=readFileSync(new URL('../src/info-pulse-content.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const feeder=readFileSync(new URL('../src/ai-feeder.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('breakdown cards animate in, glow on their tier edge, and fill the Down for bar; KPI tiles are untouched',()=>{
  assert.match(pulse,/\.pulse-breakdown-list \.pulse-breakdown-row \{ position: relative; border-left-color: transparent; animation: pulse-row-in 0\.55s/);
  assert.match(pulse,/\.pulse-breakdown-list \.pulse-breakdown-row:nth-child\(10\) \{ animation-delay: 0\.54s; \}/,'staggered entrance');
  assert.match(pulse,/\.pulse-breakdown-row::before \{ content: ''; position: absolute; top: -1px; bottom: -1px; left: -\d+px; width: \d+px;[^}]*animation: pulse-edge 2\.2s ease-out infinite/);
  assert.match(pulse,/\.pulse-rank \{ color: #fff; background: linear-gradient\(135deg, color-mix\(in srgb, var\(--tier\) 60%, #fff\), var\(--tier\)\);/);
  assert.match(pulse,/\.pulse-row-status i\.pulse-tier-tag::before \{[^}]*animation: pulse-dot/);
  assert.match(pulse,/\.pulse-standing-bar::after \{ background: linear-gradient\(90deg,[^}]*animation: pulse-fill 1\.2s/);
  assert.match(pulse,/\.pulse-standing-bar::before \{[^}]*width: calc\(var\(--fill, 0\) \* 100%\);[^}]*animation: pulse-shimmer/);
  assert.match(pulse,/\.pulse-row-timing \.overdue::after \{[^}]*animation: pulse-ring/);
  assert.match(pulse,/\.pulse-updates-button b \{ color: #fff; background: linear-gradient\(135deg, #8b5cf6, #522e90\); \}/);
  for(const name of ['pulse-row-in','pulse-edge','pulse-dot','pulse-ring','pulse-blink','pulse-fill','pulse-shimmer'])assert.match(pulse,new RegExp(`@keyframes ${name} \\{`),name);
  assert.match(pulse,/@media \(prefers-reduced-motion: reduce\) \{\s*\.pulse-breakdown-list \.pulse-breakdown-row,/);
  // KPI tiles keep their existing rules and gain nothing new.
  const added=pulse.slice(pulse.indexOf('/* Breakdown cards: graphical and animated.'));
  assert.doesNotMatch(added,/\.pulse-kpi/);
});

test('the Info Pulse icon is a live working trace in the header trigger and the overlay title',()=>{
  assert.match(feeder,/\.ai-feeder-trigger > svg:first-child,\s*\.ai-feeder-kicker > svg \{[^}]*animation: ai-pulse-beat 1\.6s ease-in-out infinite;/);
  assert.match(feeder,/\.ai-feeder-trigger > svg:first-child path,\s*\.ai-feeder-kicker > svg path \{\s*stroke-dasharray: 26 64;\s*animation: ai-pulse-trace 1\.6s linear infinite;/);
  assert.match(feeder,/@keyframes ai-pulse-trace \{ to \{ stroke-dashoffset: -90; \} \}/);
  assert.match(feeder,/@media \(prefers-reduced-motion: reduce\) \{\s*\.ai-feeder-trigger > svg:first-child, \.ai-feeder-kicker > svg,[^}]*animation: none !important; stroke-dasharray: none;/);
});
