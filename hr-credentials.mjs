import {hrAccessEnabled} from './hr-permissions.mjs';
// HR uses the existing account credentials, not a second username or password.
export function prepareHrCredentials(record,previous={}){
 const {hrPassword,hrPasswordHash,hrLogin,hrDesktopAccess,hrMobileAccess,...clean}=record;
 return {...clean,hrAccess:hrAccessEnabled(Object.hasOwn(record,'hrAccess')?record:previous)};
}
