import test from 'node:test';
import assert from 'node:assert/strict';
import {transfersWithDoorNumbers} from '../vehicle-transfer-workflow.mjs';
test('transfer cards resolve imported master door labels for existing and moved vehicles',()=>{
 const masters=[{id:4,door:'',equipmentName:'EX-42',chassisNo:'CH-42',currentLocation:'Destination'}];
 assert.equal(transfersWithDoorNumbers([{equipmentMasterId:4,door:'',equipment:'84926'}],masters)[0].door,'EX-42');
 assert.equal(transfersWithDoorNumbers([{chassisNo:'CH-42',source:'Source'}],masters)[0].door,'EX-42');
});
test('transfer identity never guesses a door from a model, conflicting chassis, or duplicate matches',()=>{
 const masters=[{id:1,door:'EX-1',reg:'REG1',chassisNo:'CH1'},{id:2,door:'EX-2',reg:'REG1',chassisNo:'CH2'}];
 for(const transfer of [{reg:'REG1'},{reg:'REG1',chassisNo:'OTHER'},{equipment:'EC480DL'}])assert.equal(transfersWithDoorNumbers([transfer],masters)[0].door,'');
 assert.equal(transfersWithDoorNumbers([{door:'SAVED-1'}],[])[0].door,'SAVED-1');
});
