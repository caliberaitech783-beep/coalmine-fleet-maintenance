import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const styles=readFileSync(new URL('../src/help-training.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('the Help & Training trigger is an animated glass badge in every header that mounts it',()=>{
  assert.equal((source.match(/<HelpTraining /g)||[]).length,2,'operational header and Manager admin header');
  assert.match(styles,/\.help-training-entry>button\.help-training-trigger\{position:relative;isolation:isolate;display:grid;place-items:center;width:40px;height:40px;[^}]*background:linear-gradient\(135deg,#a855f7,#6b2fa8\);[^}]*animation:help-bob 2\.8s ease-in-out infinite\}/);
  assert.match(styles,/\.help-training-entry>button\.help-training-trigger:hover,\.help-training-entry>button\.help-training-trigger:focus-visible\{animation:none;transform:translateY\(-2px\) scale\(1\.06\);/,'hover stops the bob so the lift applies');
  assert.match(styles,/\.help-training-entry>button\.help-training-trigger svg\{[^}]*animation:help-nod 2\.8s ease-in-out infinite\}/);
  assert.match(styles,/\.help-training-entry>button\.help-training-trigger::before\{[^}]*border:2px dashed #ffffffa6;[^}]*animation:help-orbit 9s linear infinite;/);
  assert.match(styles,/\.help-training-entry>button\.help-training-trigger::after\{[^}]*animation:help-spark 1\.8s ease-out infinite;/);
  for(const name of ['help-bob','help-nod','help-orbit','help-spark'])assert.match(styles,new RegExp(`@keyframes ${name}\\{`),name);
  assert.match(styles,/@media \(prefers-reduced-motion:reduce\)\{\.help-training-entry>button\.help-training-trigger,/);
  // The original rules the existing tests pin are still present.
  assert.match(styles,/\.normal>header \.help-training-trigger\{width:39px;/);
});
