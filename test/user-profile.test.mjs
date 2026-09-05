import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('both signed-in headers use the shared current-user details control', () => {
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.equal((source.match(/<UserProfile session=\{session\}/g) || []).length, 2);
  assert.match(source, /role=\{mobileRole\} location=\{assignedLocation\}/);
});

test('profile popup exposes only selected identity fields and supports dismissal', () => {
  const source = readFileSync(new URL('../src/user-profile.jsx', import.meta.url), 'utf8');
  assert.match(source, /session\?\.login/);
  assert.doesNotMatch(source, /session\?\.(token|password)|JSON.stringify/);
  for (const interaction of ['onMouseEnter', 'onClick', 'onBlur', 'Escape', 'pointerdown', 'aria-expanded']) assert.ok(source.includes(interaction));
});
