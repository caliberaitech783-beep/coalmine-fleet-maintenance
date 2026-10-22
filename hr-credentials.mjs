import {hashPassword} from './password-auth.mjs';
import {hrAccessEnabled,normalizedHrSelection} from './hr-permissions.mjs';
export function prepareHrCredentials(record,previous={}){
 if(!['hrAccess','hrLogin','hrPassword','hrPasswordHash','hrDesktopAccess','hrMobileAccess'].some(key=>Object.hasOwn(record,key))&&previous.hrPasswordHash)return {...record,...Object.fromEntries(['hrAccess','hrLogin','hrPasswordHash','hrDesktopAccess','hrMobileAccess'].map(key=>[key,previous[key]]))};
 const {hrPassword,hrPasswordHash:ignored,...clean}=record;
 const enabled=hrAccessEnabled(clean),login=String(clean.hrLogin||'').trim().toLowerCase();
 const desktop=normalizedHrSelection(clean.hrDesktopAccess),mobile=normalizedHrSelection(clean.hrMobileAccess);
 const invalid=message=>Object.assign(new Error(message),{status:400});
 if(enabled&&!/^[a-z0-9][a-z0-9._@+-]{1,119}$/.test(login))throw invalid('Enter a valid HR username (2–120 characters).');
 if(hrPassword&&(typeof hrPassword!=='string'||hrPassword.length<12||hrPassword.length>256))throw invalid('HR password must contain 12–256 characters.');
 if(enabled&&!hrPassword&&!previous.hrPasswordHash)throw invalid('Set a separate HR password before enabling HR portal access.');
 if(enabled&&!desktop.length&&!mobile.length)throw invalid('Select at least one HR portal menu for desktop or mobile.');
 return {...clean,hrAccess:enabled,hrLogin:login,hrPasswordHash:hrPassword?hashPassword(hrPassword):previous.hrPasswordHash||'',hrDesktopAccess:desktop,hrMobileAccess:mobile};
}
