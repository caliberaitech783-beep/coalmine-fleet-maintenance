import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {classificationActive, newClassification, updateClassification, classificationError, breakdownCategories, breakdownSubCategories} from '../repair-classification.mjs';

test('rollout starts at 5 PM IST on October 28, independent of host timezone', () => {
  assert.equal(classificationActive('2026-10-28T11:29:59.999Z'), false);
  assert.equal(classificationActive('2026-10-28T11:30:00.000Z'), true);
  assert.equal(newClassification({}, '2026-10-28T16:59:59+05:30'), null);
  assert.equal(newClassification({}, '2026-10-28T17:00:00+05:30').version, 1);
});

test('ordinary repair types expose all 18 non-service categories', () => {
  for (const type of ['Preventive', 'Breakdown', 'Accidental']) {
    const categories = breakdownCategories(type);
    assert.equal(categories.length, 18);
    assert.ok(categories.includes('ENGINE'));
    assert.ok(!categories.includes('SCHEDULED SERVICE'));
    assert.ok(!categories.includes('WGM'));
  }
  assert.deepEqual(breakdownCategories('Scheduled'), ['SCHEDULED SERVICE']);
  assert.deepEqual(breakdownCategories('WGM'), ['WGM']);
  assert.deepEqual(breakdownCategories(''), []);
});

test('all 133 supplied subcategories validate under their permitted repair types', () => {
  let count = 0;
  for (const type of ['Breakdown', 'Scheduled', 'WGM']) {
    for (const category of breakdownCategories(type)) {
      for (const subCategory of breakdownSubCategories(category)) {
        assert.equal(classificationError({repairType:type, breakdownCategory:category, breakdownSubCategory:subCategory}, true), '');
        count++;
      }
    }
  }
  assert.equal(count, 133);
  assert.deepEqual(breakdownSubCategories('WGM'), ['WGM']);
  assert.ok(breakdownSubCategories('SCHEDULED SERVICE').includes('HOUR SERVICE 250'));
});

test('maintenance requires all fields; production can omit any downstream field', () => {
  assert.ok(classificationError({}, true));
  assert.equal(classificationError({}, false), '');
  assert.equal(classificationError({repairType:'Scheduled'}, false), '');
  assert.ok(classificationError({repairType:'Scheduled'}, true));
  assert.ok(classificationError({repairType:'Preventive', breakdownCategory:'WGM'}, false));
  assert.ok(classificationError({repairType:'WGM', breakdownCategory:'WGM', breakdownSubCategory:'Oil Pump'}, false));
  assert.ok(classificationError({breakdownSubCategory:'Oil Pump'}, false));
});

test('legacy tickets cannot be opted into new prompts by an update payload', () => {
  const input = {version:1, repairType:'WGM', breakdownCategory:'WGM', breakdownSubCategory:'WGM'};
  assert.equal(updateClassification(null, input), null);
  assert.equal(updateClassification(undefined, input), null);
  assert.deepEqual(updateClassification(input, undefined), input);
  assert.equal(updateClassification(input, {version:0}).version, 1);
});

test('API preserves continuation exemption and validates maintenance create/edit/close', () => {
  const server = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const create = server.slice(server.indexOf("app.post('/api/requests',"), server.indexOf("app.patch('/api/requests/:reference',"));
  assert.ok(create.indexOf('createRequestWithVehicleLock(') < create.indexOf('newClassification('));
  assert.equal((server.match(/classificationError\(classification,req.session.assignedRole==='Maintenance User'\)/g) || []).length, 2);
  assert.equal((server.match(/await saveRequestClassification\(/g) || []).length, 3);
  assert.match(server, /ADD COLUMN IF NOT EXISTS classification JSONB;/);
  assert.doesNotMatch(server, /UPDATE maintenance_requests SET classification=.*version/);
});
