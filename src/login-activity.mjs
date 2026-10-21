// Login timestamps and evidence of use are different facts. Missing history
// cannot prove that a person never used the application. Days use India dates.

const INDIA_OFFSET_MS=330*60_000;
const indiaDayNumber=(value)=>{
  const time=new Date(value).getTime();
  return Number.isNaN(time)?null:Math.floor((time+INDIA_OFFSET_MS)/86_400_000);
};

/** Whole days since the last login (0 = today), or null when there is no recorded login. */
export function daysSinceLogin(lastLogin,now=new Date()){
  if(!lastLogin)return null;
  const last=indiaDayNumber(lastLogin),today=indiaDayNumber(now);
  if(last===null||today===null)return null;
  return Math.max(0,today-last);
}

/** Short status text for a user row. */
export function loginActivityStatus(row={},now=new Date()){
  const days=daysSinceLogin(row.lastLogin,now);
  const activityDays=daysSinceLogin(row.lastActivity,now);
  if(days===null)return activityDays===null?'No recorded activity':'Used before · Login time unavailable';
  if(activityDays===0&&days>0)return 'Active today · Earlier login';
  if(days===0)return 'Logged in today';
  if(days===1)return 'Last login yesterday';
  return `Not logged in for ${days} days`;
}

export const LOGIN_ACTIVITY_FILTERS=[
  {value:'all',label:'All users'},
  {value:'never',label:'No recorded activity'},
  {value:'activity-only',label:'Used before · Login time unavailable'},
  {value:'7',label:'Last recorded login 7 days ago or earlier'},
  {value:'30',label:'Last recorded login 30 days ago or earlier'},
];

/** Unknown dates are not treated as inactivity. No-evidence rows sort first. */
export function loginActivityRows(users=[],filter='all',now=new Date()){
  const minimum=/^\d+$/.test(String(filter))?Number(filter):null;
  return users.map((row)=>({...row,daysSince:daysSinceLogin(row.lastLogin,now),hasActivity:daysSinceLogin(row.lastActivity,now)!==null||daysSinceLogin(row.lastLogin,now)!==null,status:loginActivityStatus(row,now)}))
    .filter((row)=>filter==='all'||(filter==='never'?!row.hasActivity:filter==='activity-only'?row.daysSince===null&&row.hasActivity:minimum!==null&&row.daysSince!==null&&row.daysSince>=minimum))
    .sort((a,b)=>{
      if(a.hasActivity!==b.hasActivity)return a.hasActivity?1:-1;
      if((a.daysSince===null)!==(b.daysSince===null))return a.daysSince===null?-1:1;
      if(a.daysSince!==b.daysSince)return (b.daysSince??0)-(a.daysSince??0);
      return String(a.name||a.login).localeCompare(String(b.name||b.login),undefined,{sensitivity:'base'});
    });
}
