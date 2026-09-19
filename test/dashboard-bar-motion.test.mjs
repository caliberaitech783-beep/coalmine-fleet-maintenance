import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const css=readFileSync(new URL('../src/dashboard-bar-motion.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('the dashboard filter bar motion stylesheet loads after the bar styles and before the pinned last five',()=>{
  const imports=[...source.matchAll(/import ["'](.+\.css)["'];/g)].map(m=>m[1]);
  const at=imports.indexOf('./dashboard-bar-motion.css');
  assert.ok(at>imports.indexOf('./dashboard-concept-a.css')&&at>imports.indexOf('./brand-theme.css')&&at>imports.indexOf('./nav-motion.css'));
  assert.ok(at<imports.indexOf('./workspace-readability.css'));
  assert.deepEqual(imports.slice(-5),['./workspace-readability.css','./dashboard-readability.css','./dashboard-spacing.css','./mobile-phone-optimization.css','./dashboard-night.css']);
});

test('the bar keeps its size and brand mark: only decoration, hover and motion are added',()=>{
  assert.doesNotMatch(css,/\.mine-brandmark|\.mine-dashboard-head \{[^}]*(height|width|padding|gap)/,'no size or brand changes');
  assert.doesNotMatch(css,/\.mine-dashboard-head \{[^}]*position/,'the bar keeps its sticky / relative position from the existing sheets');
  assert.match(css,/\.mine-dashboard-head::before \{[^}]*background-size: 250% 100%; animation: bar-sheen 9s linear infinite;/);
  assert.match(css,/\.mine-dashboard-head h1::after \{[^}]*animation: bar-draw 1\.1s 0\.3s/);
  assert.match(css,/\.mine-dashboard-head \.mine-eyebrow::before \{[^}]*animation: bar-beat 1\.6s ease-out infinite;/);
  for(const [sel,colour] of [['label:has\\(> select\\[aria-label="Region"\\]\\)','#7dd3fc'],['label\\.mine-site-filter','#4ade80'],['label\\.mine-oem-filter','#c084fc'],['label:has\\(> input\\[aria-label="Dashboard from date"\\]\\)','#fbbf24'],['label:has\\(> input\\[aria-label="Dashboard to date"\\]\\)','#fb7185']])
    assert.match(css,new RegExp(`\\.mine-dashboard-head \\.mine-head-actions ${sel} \\{ --m: ${colour}; \\}`),sel);
  assert.match(css,/label:hover :is\(select, input\), \.mine-dashboard-head \.mine-head-actions label:focus-within :is\(select, input\) \{ transform: translateY\(-2px\);/);
  assert.match(css,/\.mine-dashboard-head \.mine-updated svg path \{ stroke-dasharray: 52 20; animation: bar-trace 1\.6s linear infinite; \}/);
  assert.match(css,/\.mine-dashboard-head h1 \{ position: relative; \}/,'the title keeps wrapping inside the brand block');
  assert.doesNotMatch(css,/h1 \{[^}]*max-content/,'never widen the title into the filters');
  assert.match(css,/@keyframes bar-trace \{ to \{ stroke-dashoffset: 72; \} \}/,'positive offset runs the Activity trace left to right');
  assert.doesNotMatch(css,/\.dashboard-export-trigger[^{]*\{[^}]*transform: translate/,'the export menu opens from its trigger, so it never moves');
  assert.match(css,/\.mine-dashboard-head \.dashboard-banner-toggle svg \{ transform-origin: center; animation: bar-blink 4s ease-in-out infinite; \}/);
  assert.match(css,/\.manager-dashboard-head::before \{[^}]*animation: bar-sheen 9s linear infinite;/,'Manager dashboard bar gets the same sheen');
  assert.match(css,/@media \(prefers-reduced-motion: reduce\) \{/);
});
