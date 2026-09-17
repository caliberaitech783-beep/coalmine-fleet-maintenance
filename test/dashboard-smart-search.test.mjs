import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {matchesSmartSearch} from '../smart-search.mjs';

test('dashboard icon searches cards rather than opening fleet records', () => {
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const browser = readFileSync(new URL('../src/dashboard-record-browser.jsx', import.meta.url), 'utf8');
  assert.ok(main.includes('window.dispatchEvent(new Event("dashboard-smart-search"))'));
  assert.ok(main.includes('window.addEventListener("dashboard-smart-search", openSearch)'));
  assert.ok(main.includes('window.removeEventListener("dashboard-smart-search", openSearch)'));
  const handler = main.match(/const openSearch = \(\) => \{([^}]+)\}/)[1];
  assert.match(handler, /setCardSearchOpen\(true\)/);
  assert.doesNotMatch(handler, /setAssetDrilldown/);
  const cards = new Function(`return ${main.match(/const dashboardSearchCards = (\[[\s\S]*?\]);/)[1]}`)();
  assert.deepEqual(cards.filter(card => matchesSmartSearch('daily bd balance', card.title)).map(card => card.selector), ['.daily-bd-balance']);
  assert.ok(main.includes('target.scrollIntoView'));
  assert.ok(browser.includes('datedRows.filter((row) => matchesSmartSearch(searchQuery, row))'));
  assert.ok(browser.includes('aria-label="Search fleet"'));
  const rows = [{door: 'V606-96911', site: 'Sasti OB', model: 'FMX'}, {door: 'D2', site: 'Majri OB'}];
  assert.deepEqual(rows.filter(row => matchesSmartSearch('v606 96911 sasti', row)), [rows[0]]);
  assert.equal(rows.filter(row => matchesSmartSearch('not-found', row)).length, 0);
  assert.equal(rows.filter(row => matchesSmartSearch('', row)).length, 2);
});
