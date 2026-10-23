export const HR_APPLICATION_URL='https://hrpulse.cmll.in';
export const HR_PERMISSION_OPTIONS=[
 ['Dashboard','Portal menus'],['Employee Master','Portal menus'],['Master Configuration','Portal menus'],['Employee Onboarding','Portal menus'],['Employee Directory','Portal menus'],['Approval Management','Portal menus'],['Shift Management','Portal menus'],['Holiday & Leave','Portal menus'],['Reports & MIS','Portal menus'],['Administration','Portal menus'],['Audit Logs','Portal menus'],
 ['Company & Sites','Configuration masters'],['Department & Designation','Configuration masters'],['New Joinee Approval Flow','Configuration masters'],['Add New Employee Form','Configuration masters'],['Bulk Upload Existing Staff','Configuration masters'],['Shift Master','Configuration masters'],['Holiday & Leave Master','Configuration masters'],['Approval Matrix','Configuration masters'],
].map(([key,group])=>({key,label:key,group}));
export const HR_ALL_PERMISSIONS=HR_PERMISSION_OPTIONS.map(option=>option.key);
export function normalizedHrSelection(raw){return [...new Set((Array.isArray(raw)?raw:String(raw||'').split(/\s*\|\s*/)).filter(value=>HR_ALL_PERMISSIONS.includes(value)))];}
export const hrAccessEnabled=user=>user?.hrAccess===true||['true','yes','1'].includes(String(user?.hrAccess||'').toLowerCase());
export function hrProfilePermissions(user){return {application:'HR',hrDesktopAccess:normalizedHrSelection(user.hrDesktopAccess),hrMobileAccess:normalizedHrSelection(user.hrMobileAccess)};}
export function hrAccessManagementRequested(record={},previous={}){
 return hrAccessEnabled(record)||hrAccessEnabled(previous)||Boolean(record.hrPassword)||Boolean(String(record.hrLogin||'').trim())||normalizedHrSelection(record.hrDesktopAccess).length>0||normalizedHrSelection(record.hrMobileAccess).length>0;
}
