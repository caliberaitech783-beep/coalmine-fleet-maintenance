import test from 'node:test';
import assert from 'node:assert/strict';
import {closeResponsibilityError} from '../close-responsibility.mjs';
test('closure requires an explicit valid responsibility',()=>{
  for(const value of [undefined,null,'','OEM parts','OTHER'])assert.ok(closeResponsibilityError({ref:'REQ-1',oemResponsibility:value},'Closed'));
  for(const value of ['OEM','NON OEM'])assert.equal(closeResponsibilityError({oemResponsibility:value},'Closed'),'');
});
test('idle closure cannot bypass responsibility; Running BD remains unchanged',()=>{
  assert.ok(closeResponsibilityError({},'Closed',true));
  assert.equal(closeResponsibilityError({},'Running BD'),'');
});
