import {displaySiteName, displaySiteSelection} from './region-scope.mjs';
import {equipmentMasterWithDoor} from './equipment-door.mjs';
import {CDIR_MASTERS} from './cdir-masters.mjs';

// The masters Diesel shows read-only at the top of its Master Data: Site, Region,
// Equipment, Employee, Driver and Shift. Only the listed fields leave Pulse; logins,
// privileges, date of birth, UAN and Aadhaar stay here.
export const DIESEL_FEED_MASTERS=['Region master','Equipment master','Shift Master',CDIR_MASTERS.employee,CDIR_MASTERS.contact];

const text=value=>String(value??'').trim().slice(0,1024);
const pick=(record,keys)=>Object.fromEntries(keys.map(key=>[key,text(record[key])]));
const equipmentKeys=['door','reg','currentLocation','equipmentName','category','group','itemName','itemSpecification',
  'acquisitionDate','make','model','manufacturerSerialNo','engineNo','chassisNo','documentStatus','asset','status'];
const shiftKeys=['site','shiftName','shiftCode','startTime','endTime','effectiveFrom','effectiveTo','status','remarks'];
const employeeKeys=['empId','name','site','category','designation','department','reportingTo','status','gender','doj','staffLevel','localStatus'];
// Drivers and machine operators, not the office "Data Entry Operator" designations.
const drives=designation=>/\b(drivers?|operators?|opr|optr)\b/i.test(designation)&&!/\b(data|entry|computer)\b/i.test(designation);
const nameKey=value=>text(value).toUpperCase().replace(/[^A-Z0-9]/g,'');

// The ERP holds every driver and operator; the directory is a staff list with only a few of them.
// A directory person joins an ERP driver only when both the employee code and the name agree.
function driverMaster(employee,erpDrivers){
  const staff=new Map(employee.filter(person=>person.empId).map(person=>[person.empId.toLowerCase()+'|'+nameKey(person.name),person]));
  const joined=new Set();
  const fromErp=erpDrivers.filter(driver=>text(driver.code)&&text(driver.name)).map(driver=>{
    const person=staff.get(text(driver.code).toLowerCase()+'|'+nameKey(driver.name));
    if(person)joined.add(person);
    return {id:'erp:'+text(driver.code),empId:text(driver.code),name:text(driver.name),site:displaySiteName(driver.location)||text(person?.site),
      vehicle:text(driver.vehicle),lastDate:text(driver.lastDate),source:text(driver.source),
      designation:text(person?.designation),department:text(person?.department),status:text(person?.status),phone:text(person?.phone)};
  }).sort((first,second)=>second.lastDate.localeCompare(first.lastDate)||first.name.localeCompare(second.name));
  const directoryOnly=employee.filter(person=>drives(person.designation)&&!joined.has(person)).map(person=>({
    id:person.id,empId:person.empId,name:person.name,site:person.site,vehicle:'',lastDate:'',source:'Pulse directory',
    designation:person.designation,department:person.department,status:person.status,phone:person.phone}));
  return [...fromErp,...directoryOnly];
}

// Serves the last ERP driver list at once and refreshes it in the background when it is old.
// Only the first read after a restart waits for the ERP, and then for a bounded time.
export function createErpDriverReader({read,ttlMs=30*60_000,waitMs=12_000,now=Date.now,onError}={}){
  let rows=null,readAt=0,pending=null;
  const refresh=()=>pending??=Promise.resolve().then(read).then(next=>{rows=next;readAt=now();},error=>onError?.(error)).finally(()=>{pending=null;});
  return async()=>{
    if(!read)return null;
    if(rows&&now()-readAt<ttlMs)return rows;
    const refreshed=refresh();
    if(!rows)await Promise.race([refreshed,new Promise(resolve=>setTimeout(resolve,waitMs).unref())]);
    return rows;
  };
}

export function dieselMasterFeed(rows=[],erpDrivers=[]){
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
  const shift=of('Shift Master').map(record=>({id:record.id,...pick(record,shiftKeys),
    site:displaySiteName(record.site||record.siteName),shiftName:text(record.shiftName||record.shift)}));
  return {region,site,equipment,employee,driver:driverMaster(employee,erpDrivers||[]),shift};
}
