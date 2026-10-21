export const MIS_APPLICATION_URL='https://pulse-ll.cmll.in';
export const MIS_PERMISSION_OPTIONS=[
 ['Dashboard','Working menus'],['Users & employees','Masters'],['Employee master','Masters'],['Equipment master','Masters'],['Region master','Masters'],['Shift Master','Masters'],['Work Order master','Masters'],['Financial Year master','Masters'],['Company master','Masters'],['Pulse Master Sync','Masters'],
 ['Vehicle Log Book Options','Working menus'],['Vehicle Log Book','Working menus'],['Trip Card Bulk Scan','Working menus'],['Equipment Log Book Options','Working menus'],['Equipment Log Book','Working menus'],['Job Card Bulk Scan','Working menus'],['Reports','Working menus'],['Tickets','Working menus'],
].map(([key,group])=>({key,label:key==='Users & employees'?'Login Details':key==='Work Order master'?'Work Contract master':key,group}));
export const MIS_ALL_PERMISSIONS=MIS_PERMISSION_OPTIONS.map(x=>x.key);
export function normalizedMisSelection(raw){const values=Array.isArray(raw)?raw:String(raw||'').split(/\s*\|\s*/);return [...new Set(values.filter(x=>MIS_ALL_PERMISSIONS.includes(x)))];}
export const misAccessEnabled=user=>user?.misAccess===true||['true','yes','1'].includes(String(user?.misAccess||'').toLowerCase());
export function misProfilePermissions(user){
 const desktop=normalizedMisSelection(user.misDesktopAccess),mobile=normalizedMisSelection(user.misMobileAccess);
 const masters=MIS_PERMISSION_OPTIONS.filter(x=>x.group==='Masters').map(x=>x.key);
 const tabs=pages=>[...(pages.some(x=>masters.includes(x))?['Masters']:[]),...pages.filter(x=>['Dashboard','Reports','Tickets'].includes(x))];
 return {application:'MIS',separateMisCredentials:true,adminLevel:'Admin',misDesktopAccess:desktop,misMobileAccess:mobile,
  masterAccess:desktop.filter(x=>masters.includes(x)),mobileMasterAccess:mobile.filter(x=>masters.includes(x)),
  tabAccess:tabs(desktop),mobileTabAccess:tabs(mobile),dashboardAccess:desktop.includes('Dashboard')?['Dashboard']:[],mobileDashboardAccess:mobile.includes('Dashboard')?['Dashboard']:[],reportAccess:desktop.includes('Reports')?['Reports']:[],mobileReportAccess:mobile.includes('Reports')?['Reports']:[],ticketAccess:desktop.includes('Tickets')?['Tickets']:[],mobileTicketAccess:mobile.includes('Tickets')?['Tickets']:[]};
}
