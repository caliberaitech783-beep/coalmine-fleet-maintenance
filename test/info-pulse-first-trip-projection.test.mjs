import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildInfoPulseFirstTripPending, isProductionFirstTripPending} from '../info-pulse-data.mjs';

test('Info Pulse selects the same saved first-trip timestamp as the Production feed', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url),'utf8');
  const projection = server.match(/const infoPulseProjection=`([\s\S]*?)`;/)[1];
  const timestamp = `(SELECT to_char(pfta.production_first_trip_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') FROM production_first_trip_acceptances pfta WHERE pfta.request_reference=maintenance_requests.reference) AS "productionFirstTripAt"`;
  assert.ok(projection.includes(timestamp));
  assert.ok(server.slice(0,server.indexOf('const infoPulseProjection=')).includes(timestamp));
});

test('completed trips leave Info Pulse while pending and MIS-verified pending trips remain', () => {
  const base = {site:'Sasti OB',status:'Closed',start:'2026-09-25 09:00:00',closedAt:'2026-09-25 10:00:00'};
  const rows = [
    {...base,ref:'PENDING',productionFirstTripAt:null},
    {...base,ref:'DONE',productionFirstTripAt:'2026-09-25 11:00:00'},
    {...base,ref:'MIS-VERIFIED-PENDING',verifiedAt:'2026-09-25 12:00:00',productionFirstTripAt:null},
    {...base,ref:'OLD',start:'2026-09-21 09:00:00',productionFirstTripAt:null},
    {...base,ref:'OPEN',status:'Open',closedAt:null,productionFirstTripAt:null},
  ];
  const expected = rows.filter(isProductionFirstTripPending).map(row=>row.ref).sort();
  assert.deepEqual(expected,['MIS-VERIFIED-PENDING','PENDING']);
  assert.deepEqual(buildInfoPulseFirstTripPending(rows).map(row=>row.request.ref).sort(),expected);
});
