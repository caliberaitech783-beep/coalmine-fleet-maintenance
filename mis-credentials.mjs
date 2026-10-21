import {hashPassword} from './password-auth.mjs';
import {misAccessEnabled,normalizedMisSelection} from './mis-permissions.mjs';
export function prepareMisCredentials(record,previous={}){
 const {misPassword,misPasswordHash:ignored,...clean}=record;
 const enabled=misAccessEnabled(clean),login=String(clean.misLogin||'').trim().toLowerCase();
 if(enabled&&!/^[a-z0-9][a-z0-9._@+-]{1,119}$/.test(login))throw Object.assign(new Error('Enter a valid MIS username (2–120 characters).'),{status:400});
 if(misPassword&&(typeof misPassword!=='string'||misPassword.length<12||misPassword.length>256))throw Object.assign(new Error('MIS password must contain 12–256 characters.'),{status:400});
 if(enabled&&!misPassword&&!previous.misPasswordHash)throw Object.assign(new Error('Set a separate MIS password before enabling MIS access.'),{status:400});
 return {...clean,misAccess:enabled,misLogin:login,misPasswordHash:misPassword?hashPassword(misPassword):previous.misPasswordHash||'',misDesktopAccess:normalizedMisSelection(clean.misDesktopAccess),misMobileAccess:normalizedMisSelection(clean.misMobileAccess)};
}
