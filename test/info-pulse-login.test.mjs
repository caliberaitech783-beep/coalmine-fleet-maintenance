import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const panel = main.slice(main.indexOf('function AiFeederPanel('), main.indexOf('function AiFeeder('));
const feeder = main.slice(main.indexOf('function AiFeeder('), main.indexOf('function NotificationEntryField('));

test('Info Pulse never opens automatically or blocks the application after sign-in', () => {
  assert.doesNotMatch(feeder, /\/api\/info-pulse\/prompt/);
  assert.doesNotMatch(feeder, /setOpenMode\("login"\)|loginCloseAvailableAt|closeAvailableAt/);
  assert.match(feeder, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(feeder, /onClick=\{\(\) => setOpen\(true\)\}/);
  assert.match(feeder, /\{open && <AiFeederPanel/);
});

test('a manually opened Info Pulse is immediately dismissible', () => {
  assert.match(panel, /aria-label="Close Info Pulse"/);
  assert.match(panel, /if \(event\.key === "Escape"\) closeRef\.current\(\)/);
  assert.doesNotMatch(panel, /remainingSeconds|closeAvailableAt|role="timer"|setInterval/);
});
