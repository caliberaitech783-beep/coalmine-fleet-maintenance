import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesRequestedRole} from '../auth-role.mjs';

test('accepts Mobile User records for mobile login', () => {
  assert.equal(matchesRequestedRole('Mobile User', 'normal'), true);
  assert.equal(matchesRequestedRole('mobile user', 'normal'), true);
});

test('keeps legacy Normal User records valid for mobile login', () => {
  assert.equal(matchesRequestedRole('Normal User', 'normal'), true);
});

test('does not allow Mobile User records through super login', () => {
  assert.equal(matchesRequestedRole('Mobile User', 'super'), false);
});

test('accepts Super Admin records only for super login', () => {
  assert.equal(matchesRequestedRole('Super Admin', 'super'), true);
  assert.equal(matchesRequestedRole('Super Admin', 'normal'), false);
});
