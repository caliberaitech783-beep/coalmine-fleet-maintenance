import {hrAccessEnabled,normalizedHrSelection} from './hr-permissions.mjs';
export function prepareHrCredentials(record,previous={}){
 const {hrPassword,hrPasswordHash,hrLogin,...clean}=record;
 const enabled=hrAccessEnabled(Object.hasOwn(clean,'hrAccess')?clean:previous);
 const desktop=normalizedHrSelection(clean.hrDesktopAccess??previous.hrDesktopAccess),mobile=normalizedHrSelection(clean.hrMobileAccess??previous.hrMobileAccess);
 if(enabled&&!desktop.length&&!mobile.length)throw Object.assign(new Error('Select at least one HR portal menu for desktop or mobile.'),{status:400});
 return {...clean,hrAccess:enabled,hrDesktopAccess:desktop,hrMobileAccess:mobile};
}
