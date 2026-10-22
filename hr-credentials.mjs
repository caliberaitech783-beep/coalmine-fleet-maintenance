import {hrAccessEnabled,normalizedHrSelection} from './hr-permissions.mjs';
export function prepareHrCredentials(record={}){
 const {hrLogin,hrPassword,hrPasswordHash,...clean}=record;
 return {...clean,hrAccess:hrAccessEnabled(clean),hrDesktopAccess:normalizedHrSelection(clean.hrDesktopAccess),hrMobileAccess:normalizedHrSelection(clean.hrMobileAccess)};
}
