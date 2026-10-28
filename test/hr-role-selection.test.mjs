import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hrAccessEnabled} from '../hr-permissions.mjs';

const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const defaultsSource=source.match(/function applyUserRoleDefaults\(record\) \{[\s\S]*?\n\}/)[0];
const apply=new Function('hrAccessEnabled',`${defaultsSource};return applyUserRoleDefaults;`)(hrAccessEnabled);

test('HR-only creation and editing recognise enabled HR as a user role',()=>{
  for(const hrAccess of [true,'true']){
    const record={userType:'',userGroup:'',userRoles:'',hrAccess,hrDesktopAccess:'Employee Master',hrMobileAccess:''};
    apply(record);
    assert.equal(record.userType,'HR Application User');
    assert.equal(record.userGroup,'HR Application User');
    assert.equal(record.hrDesktopAccess,'Employee Master');
    assert.equal(record.hrMobileAccess,'');
  }
});

test('HR enable callback selects HR for an empty account without replacing existing roles',()=>{
  const callback=source.match(/<HrApplicationAccessFields record=\{record\} onEnabled=\{([^\n]+)\}\/></)[1];
  for(const initial of ['', 'User','Maintenance User','HR Application User']){
    let role=initial;
    const enabled=new Function('setAccountRole',`return (${callback});`)(update=>{role=update(role);});
    enabled(true);
    assert.equal(role,initial||'HR Application User');
    enabled(false);
    assert.equal(role,initial==='User'||initial==='Maintenance User'?initial:'');
  }
});
