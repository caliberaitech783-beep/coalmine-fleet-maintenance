import {CDIR_MASTERS} from './cdir-masters.mjs';

const text=value=>typeof value==='string'||typeof value==='number'?String(value).trim():'';
const key=value=>text(value).normalize('NFKC').toLowerCase();
const phone=value=>{
  const digits=text(value).replace(/\D/g,'');
  return /^(?:91)?[6-9]\d{9}$/.test(digits)?digits.slice(-10):'';
};

// A login is an account alias, not an employee name. Join the authenticated
// account to its saved employee ID or registered contact before using a full name.
export function dieselEmployeeLink(user,employees,contacts) {
  if(!user)return undefined;
  const employeeId=key(user.empId)||key(user.employeeId)||key(user.employeeCode);
  let matches;
  if(employeeId)matches=employees.filter(row=>key(row.empId)===employeeId);
  else {
    const email=key(user.email),mobile=phone(user.phone);
    const linked=contacts.filter(row=>(email&&key(row.email)===email)||(mobile&&phone(row.contact)===mobile));
    if(linked.length) {
      const identities=linked.map(row=>key(row.empId)?employees.filter(person=>key(person.empId)===key(row.empId)):
        employees.filter(person=>key(person.name)&&key(person.name)===key(row.name)));
      // Every matched contact must identify the same employee; a conflicting or
      // incomplete contact is not repaired by choosing a similar name.
      if(identities.some(rows=>!rows.length))return undefined;
      matches=identities.flat();
    } else matches=employees.filter(row=>key(row.name)&&key(row.name)===key(user.employee));
  }
  const identities=new Map(matches.filter(row=>key(row.empId)&&key(row.name)&&key(row.status)!=='vacant')
    .map(row=>[JSON.stringify([key(row.empId),key(row.name)]),row]));
  if(identities.size!==1)return undefined;
  return {empId:text(identities.values().next().value.empId)};
}

export function createDieselEmployeeReader(pool) {
  return async profile=>{
    const login=key(profile?.login);
    if(!login)return undefined;
    const {rows:accounts}=await pool.query(`SELECT record_data FROM master_records
      WHERE master_name='Users & employees' AND (
        lower(trim(record_data->>'login'))=$1 OR
        (coalesce(trim(record_data->>'login'),'')='' AND lower(split_part(trim(record_data->>'employee'),' ',1))=$1)
      )`,[login]);
    const exact=accounts.filter(row=>key(row.record_data?.login)===login);
    const candidates=exact.length?exact:accounts;
    if(candidates.length!==1)return undefined;
    const {rows}=await pool.query(`SELECT master_name,record_data FROM master_records WHERE master_name=ANY($1::text[])`,
      [[CDIR_MASTERS.employee,CDIR_MASTERS.contact]]);
    return dieselEmployeeLink(candidates[0].record_data,
      rows.filter(row=>row.master_name===CDIR_MASTERS.employee).map(row=>row.record_data),
      rows.filter(row=>row.master_name===CDIR_MASTERS.contact).map(row=>row.record_data));
  };
}
