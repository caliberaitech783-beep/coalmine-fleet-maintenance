import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

const data = JSON.parse(fs.readFileSync(new URL('../public/cd/directory-data.json', import.meta.url), 'utf8'));
const html = fs.readFileSync(new URL('../public/cd/caliber-directory.html', import.meta.url), 'utf8');

test('C-dir embeds the complete September 24 backup including merged shared edits', () => {
  const embedded = html.match(/<script id="directory-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(embedded);
  assert.deepEqual(JSON.parse(embedded[1]), data);
  assert.equal(data.meta.generated, '24-Sep-2026');
  // Canonical digest of the supplied backup JSON, without duplicating private staff data in tests.
  assert.equal(createHash('sha256').update(JSON.stringify(data)).digest('hex'),
    '3418955db8b56f9f5a3f9bad0ec1915cbaaf49e49ad8ac64819337cd1139efdd');
});

test('C-dir roster buckets and summary counts remain consistent after the import', () => {
  const rows = Object.values(data.matrix).flat();
  assert.equal(rows.length, data.meta.totalStaffSanctioned);
  assert.equal(rows.filter(row => row.status === 'ACTIVE').length, data.meta.totalFilled);
  assert.equal(rows.filter(row => row.status === 'VACANT').length, data.meta.totalVacant);
  for (const key of Object.keys(data.matrix)) {
    const [site, category] = key.split('|');
    assert.ok(data.sites.some(item => item.id === site), key);
    assert.ok(data.categories.includes(category), key);
  }
  for (const site of data.sites) {
    const roster = data.categories.flatMap(category => data.matrix[`${site.id}|${category}`] || []);
    assert.equal(roster.length, data.siteTotals[site.id]);
    assert.deepEqual(data.siteStats[site.id], {
      sanctioned: roster.length,
      filled: roster.filter(row => row.status === 'ACTIVE').length,
      vacant: roster.filter(row => row.status === 'VACANT').length,
    });
  }
});
