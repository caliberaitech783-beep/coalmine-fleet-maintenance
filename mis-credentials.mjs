import {misAccessEnabled,normalizedMisSelection} from './mis-permissions.mjs';
export function prepareMisCredentials(record){
 const {misLogin,misPassword,misPasswordHash,...clean}=record;
 return {...clean,misAccess:misAccessEnabled(clean),misDesktopAccess:normalizedMisSelection(clean.misDesktopAccess),misMobileAccess:normalizedMisSelection(clean.misMobileAccess)};
}
