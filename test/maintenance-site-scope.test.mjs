import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordsForSite } from '../site-location.mjs';

test('maintenance request lists include only the assigned site across statuses', () => {
  const requests = [
    {site:'SASTI OB', status:'Open'}, {site:'Sasti', status:'Closed'},
    {site:'Sasti OB', status:'Idle'}, {site:'Majri OB', status:'Open'},
    {site:'Dhoptala OB (2nd)', status:'Closed'}, {site:'', status:'Open'},
  ];
  assert.deepEqual(recordsForSite(requests, ' sasti Ob '), requests.slice(0,3));
  assert.deepEqual(recordsForSite(requests, ''), []);
});

test('API includes Maintenance User in assigned-site scope and UI filters before building lists', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url),'utf8');
  const source = readFileSync(new URL('../src/main.jsx', import.meta.url),'utf8');
  assert.match(server, /if\(req.session.role==='normal'&&\(dashboardScope\|\|req.session.assignedRole==='MIS User'\|\|req.session.assignedRole==='Maintenance User'\)\)/);
  assert.match(source, /!embedded&&isMaintenance\?recordsForSite\(requests,assignedLocation\):requests/);
  assert.match(source, /const requestRows=siteRequests.map/);
});
