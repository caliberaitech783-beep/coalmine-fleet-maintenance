import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React,{useState,useRef,useEffect} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transformWithOxc} from 'vite';
import {TENDER_ALL_PERMISSIONS, TENDER_PERMISSION_OPTIONS,normalizedTenderSelection} from '../tender-permissions.mjs';
import {assignedUserRoles,accountPrivileges} from '../account-role-access.mjs';
import {ADMIN_TAB_OPTIONS,ADMIN_SUBMENU_OPTIONS,managerRoleSelection} from '../admin-access.mjs';
import {managerRegionSelection,displaySiteSelection,sitesForManagerRegions,displaySiteName,MANAGER_REGION_OPTIONS} from '../region-scope.mjs';
import {userPermissionOptions,retainedHiddenPermissions} from '../src/user-permission-options.mjs';
const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
const selectedAccessValues=(record,key,fallback)=>String(Object.hasOwn(record,key)?record[key]:record[fallback]||'').split(/\s*\|\s*/).filter(Boolean);
const bindings={React,useState,useRef,useEffect,TENDER_ALL_PERMISSIONS,TENDER_PERMISSION_OPTIONS,normalizedTenderSelection,assignedUserRoles,accountPrivileges,ADMIN_TAB_OPTIONS,ADMIN_SUBMENU_OPTIONS,managerRoleSelection,managerRegionSelection,displaySiteSelection,sitesForManagerRegions,displaySiteName,MANAGER_REGION_OPTIONS,userPermissionOptions,retainedHiddenPermissions,selectedAccessValues,privilegeSelectionValue:value=>value,isCheckedValue:value=>value===true||value==='true',mobileAccessKey:key=>'mobile'+key[0].toUpperCase()+key.slice(1),mobileUserRoleOptions:['Production User','Maintenance User','MIS User','General User','Account User','Tender User'],mobileRoleAuthority:{'Tender User':'Tender access'},userAuthorityOptions:['Admin','Manager'],managerRoleOptions:[],operationalDefaultMenuOptions:['Requests','Tickets','CD'],operationalMenuOptions:['Requests','Tickets','CD'],GENERAL_USER_ROLE:'General User',GENERAL_USER_MENU_OPTIONS:['Requests','Tickets','CD'],operationalRequestOptions:{},userMenuOptionLabel:value=>value,navigationLabel:value=>value,ShieldCheck:()=>null,UserSiteFields:()=>null,UserPrivilegeFields:()=>null};
const functions=source.slice(source.indexOf('function AccessSelectAll('),source.indexOf('function applyUserRoleDefaults('));
const {code:compiled}=await transformWithOxc(functions,'tender-user-fields.jsx',{jsx:{runtime:'classic'}});
const Component=new Function(...Object.keys(bindings),compiled+';return UserTypeAccessFields;')(...Object.values(bindings));
function render(record){return renderToStaticMarkup(React.createElement(Component,{record}));}
function checked(html,field,value){return (html.match(/<input[^>]*>/g)||[]).some(tag=>(!field||tag.includes(`name="${field}"`))&&tag.includes(`value="${value}"`)&&tag.includes('checked=""'));}
test('Tender User renders inside the existing Team User and both menu sections',()=>{
 const html=render({userType:'Mobile User',userGroup:'Tender User',userRoles:'Tender User'});
 assert.ok(html.includes('Team User'));assert.ok(checked(html,null,'Tender User'));
 assert.equal(html.includes('Allow Tender login'),false);assert.equal(html.includes('Tender roles'),false);
 for(const field of ['tenderDesktopAccess','tenderMobileAccess']){
  for(const key of TENDER_ALL_PERMISSIONS)assert.ok(checked(html,field,key),field+':'+key);
 }
});
test('Saved custom menus and explicitly empty mobile selections survive form rendering',()=>{
 const html=render({userType:'Super Admin',adminLevel:'Admin',userGroup:'User',userRoles:'Tender User',tenderDesktopAccess:'menu.pipeline | overview.read',tenderMobileAccess:''});
 assert.ok(html.includes('Additional workspaces'));assert.ok(checked(html,'tenderDesktopAccess','menu.pipeline'));
 assert.ok(!checked(html,'tenderDesktopAccess','admin.backup'));
 assert.ok(!checked(html,'tenderMobileAccess','menu.pipeline'));
 assert.ok(html.includes('type="hidden" name="tenderMobileAccess" value=""'));
});

