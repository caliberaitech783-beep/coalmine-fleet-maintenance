import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {chooseShiftLog,erpTripImage,logbookSql,tripLookupBinds,erpTripFingerprint} from '../erp-first-trip.mjs';
const request={ref:'R1',door:'D1',site:'Sasti',closedAt:'2026-10-02 10:00:00',meterType:'KMR',closingMeterReading:'100',closingMeterReadings:{KMR:'100',HMR:'10'}};
const row={source:'Vehicle Log Book',LOG_ID:1,DOCUMENT_NO:'V1',LOG_DATE:'2026-10-02',SHIFT_FROM:'18000',SHIFT_TO:'46800',SHIFTCODE:'A',EQUIPMENT_ID:5,OPENING_KMR:90,CLOSING_KMR:110,OPENING_HMR:9,CLOSING_HMR:12,METER_ACTIVE:'YES',FIRST_OPERATION:'2026-10-02 00:00:00'};
const now=Date.parse('2026-10-03T12:00:00+05:30');
test('completed shift uses correct meter fields, keeps repair readings and does not invent midnight trip time',()=>{
 const result=chooseShiftLog(request,[row],now);assert.equal(result.status,'ready');assert.deepEqual(result.record.closingReadings,{KMR:'110',HMR:'12'});assert.equal(result.repairReadings.KMR,'100');assert.equal(result.record.firstOperation,'2026-10-02 00:00:00');assert.equal(result.requestHash,erpTripFingerprint(request));
});
test('overnight shift boundaries and incomplete shifts',()=>{
 const night={...row,SHIFT_FROM:'75600',SHIFT_TO:'18000'};
 assert.equal(chooseShiftLog({...request,closedAt:'2026-10-02 23:00:00'},[night],now).record.shiftEnd,'2026-10-02T23:30:00.000Z');
 assert.equal(chooseShiftLog(request,[row],Date.parse('2026-10-02T12:00:00+05:30')).status,'pending');
 assert.equal(chooseShiftLog({...request,closedAt:'2026-10-02 14:00:00'},[row],now).status,'pending');
});
test('duplicates, missing/reset meters, inactive meters cannot generate approvable evidence',()=>{
 assert.equal(chooseShiftLog(request,[row,{...row,LOG_ID:2}],now).status,'review');
 for(const changed of [{CLOSING_KMR:null},{CLOSING_KMR:99},{CLOSING_HMR:-1},{METER_ACTIVE:'NO'}])assert.equal(chooseShiftLog(request,[{...row,...changed}],now).status,'review');
});
test('bound Oracle query limits door/site/date and cannot accept injected source identifiers',()=>{
 assert.throws(()=>logbookSql('x;drop'));
 assert.deepEqual(tripLookupBinds(request),{door_key:'D1',site_key:'SASTI',closed_at:'2026-10-02 10:00:00'});
 for(const kind of ['vehicle','equipment']){const sql=logbookSql(kind);assert.match(sql,/:site_key/);assert.match(sql,/:door_key/);assert.match(sql,/:closed_at/);assert.doesNotMatch(sql,/UPDATE|DELETE|INSERT/);}
});
test('generated attachment is a readable PNG even with XML metacharacters',async()=>{
 const evidence=chooseShiftLog({...request,site:'A&B <site>'},[row],now);const image=await erpTripImage(evidence,request);const metadata=await sharp(Buffer.from(image.split(',')[1],'base64')).metadata();assert.equal(metadata.format,'png');assert.equal(metadata.width,1200);assert.equal(metadata.height,850);
});

test('entered trip time selects its own shift and treats shift end as next shift boundary',()=>{
 const afternoon={...row,LOG_ID:2,SHIFTCODE:'B',SHIFT_FROM:'46800',SHIFT_TO:'75600'};
 const result=chooseShiftLog({...request,erpLookupAt:'2026-10-02 13:00:00'},[row,afternoon],now);
 assert.equal(result.record.shift,'B');assert.equal(result.lookupAt,'2026-10-02 13:00:00');
});
