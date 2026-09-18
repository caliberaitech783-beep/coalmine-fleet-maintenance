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

test('the Info Pulse icon is the shared left-to-right pulse with a moving dot, and the count badge glows',()=>{
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  assert.match(main,/<PulseIcon \/><span>INFO PULSE<\/span>/,'header trigger');
  assert.match(main,/<span className="ai-feeder-kicker"><PulseIcon \/> INFO PULSE<\/span>/,'overlay title');
  assert.doesNotMatch(feeder,/ai-pulse-trace|stroke-dasharray: 26 64/,'old trace rules removed');
  assert.match(feeder,/\.ai-feeder-trigger-count \{ position: relative; border-radius: 10px; background: linear-gradient\(135deg, #ff6b6b, #b81c3c\);[^}]*animation: ai-count-glow 1\.4s ease-out infinite; \}/);
  assert.match(feeder,/\.ai-feeder-trigger-count::after \{[^}]*animation: ai-count-ring 1\.4s ease-out infinite;/);
});
