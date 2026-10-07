import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {requestMeterReadings,requestMeterTypeForRequest} from '../request-equipment.mjs';
import {validateClosingMeterReadings} from '../request-workflow.mjs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const form=source.slice(source.indexOf('function VerifyRequestForm('),source.indexOf('function ProductionFirstTripForm('));
const start=form.indexOf('        const closingMeterReadings =');
const end=form.indexOf('\n      } catch',start);
const submit=new Function('request','equipmentRecords','meterReadingsFromForm','requestMeterTypeForRequest','form','onSave','firstTripDone','firstTripCardImage','return (async()=>{'+form.slice(start,end)+'})();');

for(const primary of ['KMR','HMR'])test(`verification keeps ${primary} identity with and without Equipment Master visibility`,async()=>{
  const request={meterType:primary,door:'V513',equipmentGroup:'VOLVO TIPPERS',openingMeterReadings:{HMR:'100',KMR:'2000'}};
  const readings={HMR:'110',KMR:'2100'};
  for(const masters of [[],[{door:'V513',category:'Equipment',group:'VOLVO TIPPERS'}]]){
    let payload;
    await submit(request,masters,()=>({...readings}),requestMeterTypeForRequest,{get:()=>''},value=>{payload=value;},true,'image');
    assert.deepEqual(payload.closingMeterReadings,readings);
    assert.equal(payload.closingMeterReading,readings[primary]);
    assert.doesNotThrow(()=>validateClosingMeterReadings(request,payload));
    assert.throws(()=>validateClosingMeterReadings(request,{...payload,closingMeterReadings:{...readings,[primary]:'1'},closingMeterReading:'1'}),/cannot be lower/);
    assert.throws(()=>validateClosingMeterReadings(request,{...payload,closingMeterReading:'9999'}),/Conflicting closing/);
  }
});
test('equipment remains HMR-only and requests without a saved type use the server HMR fallback',async()=>{
  for(const request of [{meterType:'HMR',equipmentGroup:'EXCAVATORS'},{}]){
    let payload;
    await submit(request,[],()=>requestMeterReadings({...request,closingMeterReadings:{HMR:'110'}},'closing'),requestMeterTypeForRequest,{get:()=>''},value=>{payload=value;},true,'image');
    assert.deepEqual(payload.closingMeterReadings,{HMR:'110'});
    assert.equal(payload.closingMeterReading,'110');
  }
});
