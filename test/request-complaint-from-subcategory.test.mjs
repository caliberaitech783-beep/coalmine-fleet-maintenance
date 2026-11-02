import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

test('Create Request copies mapped sub-category to complaint and leaves Other blank',()=>{
  const fields=readFileSync(new URL('../src/repair-classification-fields.jsx',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
  assert.match(fields,/onSubCategoryChange\?\.\(\/\^others\?\$\/i\.test\(value\)\?'':value\)/);
  assert.match(fields,/onSubCategoryChange\?\.\(''\)/);
  assert.match(main,/const \[complaintSuggestion,setComplaintSuggestion\]=useState\(""\)/);
  assert.match(main,/<RepairClassificationFields required onSubCategoryChange=\{setComplaintSuggestion\}/);
  assert.match(main,/<SpeechComplaint suggestedText=\{complaintSuggestion\}/);
  assert.match(main,/if\(suggestedText!==undefined\)setText\(String\(suggestedText\|\|''\)\)/);
});
