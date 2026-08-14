import test from 'node:test';
import assert from 'node:assert/strict';
import {filterRowsByRequestedRole, matchesRequestedRole} from '../auth-role.mjs';

test('narrows duplicate login names to the selected access type', () => {
  const rows = [
    {record_data: {login: 'sanskar', userType: 'Super Admin User'}},
    {record_data: {login: 'sanskar', userType: 'Mobile User'}},
  ];
  assert.deepEqual(filterRowsByRequestedRole(rows, 'super'), [rows[0]]);
  assert.deepEqual(filterRowsByRequestedRole(rows, 'normal'), [rows[1]]);
});

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
