import {displaySiteName, displaySiteSelection} from './region-scope.mjs';
import {equipmentMasterWithDoor} from './equipment-door.mjs';
import {CDIR_MASTERS} from './cdir-masters.mjs';

// The masters Diesel shows read-only at the top of its Master Data: Site, Region,
// Equipment, Employee and Driver. Only the listed fields leave Pulse; logins,
// privileges, date of birth, UAN and Aadhaar stay here.
export const DIESEL_FEED_MASTERS=['Region master','Equipment master',CDIR_MASTERS.employee,CDIR_MASTERS.contact];

const text=value=>String(value??'').trim().slice(0,1024);
const pick=(record,keys)=>Object.fromEntries(keys.map(key=>[key,text(record[key])]));
const equipmentKeys=['door','reg','currentLocation','equipmentName','category','group','itemName','itemSpecification',
  'acquisitionDate','make','model','manufacturerSerialNo','engineNo','chassisNo','documentStatus','asset','status'];
const employeeKeys=['empId','name','site','category','designation','department','reportingTo','status','gender','doj','staffLevel','localStatus'];
// Drivers and machine operators, not the office "Data Entry Operator" designations.
const drives=designation=>/\b(driver|operator)\b/i.test(designation)&&!/\b(data|entry|computer)\b/i.test(designation);

export function dieselMasterFeed(rows=[]){
  const of=name=>rows.filter(row=>row.master_name===name).map(row=>({...row.record_data,id:String(row.id)}));
  const region=of('Region master').map(record=>({id:record.id,...pick(record,['name','code','state']),
    sites:displaySiteSelection(record.sites).join(' | ')}));
  const site=region.flatMap(record=>record.sites.split(' | ').filter(Boolean).map(name=>({
    id:record.id+':'+name,name,region:record.name,regionCode:record.code,state:record.state})));
  const equipment=of('Equipment master').map(record=>{
    const shown=equipmentMasterWithDoor(record);
    return {id:record.id,...pick(shown,equipmentKeys),
      currentLocation:displaySiteName(shown.currentLocation||shown.location||shown.site)};
  });
  const contacts=new Map(of(CDIR_MASTERS.contact).filter(record=>text(record.empId)).map(record=>[text(record.empId).toLowerCase(),record]));
  const employee=of(CDIR_MASTERS.employee).filter(record=>text(record.name)&&text(record.status).toUpperCase()!=='VACANT').map(record=>{
    const contact=contacts.get(text(record.empId).toLowerCase())||{};
    return {id:record.id,...pick(record,employeeKeys),site:displaySiteName(record.site),phone:text(contact.contact),email:text(contact.email)};
  });
  return {region,site,equipment,employee,driver:employee.filter(record=>drives(record.designation))};
}
