// "Never logged in" view: who has never signed in, and for everyone else how
// many days it has been since their last sign-in. Pure helpers, shared by the
// page and its tests. Days are counted on India calendar dates.

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
  if(days===null)return 'Never logged in';
  if(days===0)return 'Logged in today';
  if(days===1)return 'Last login yesterday';
  return `Not logged in for ${days} days`;
}

export const LOGIN_ACTIVITY_FILTERS=[
  {value:'never',label:'Never logged in'},
  {value:'7',label:'Not logged in for 7 days or more'},
  {value:'30',label:'Not logged in for 30 days or more'},
  {value:'all',label:'All users'},
];

/** Rows for the chosen filter, each with `daysSince` and `status`, never-logged-in first, then the longest absence first. */
export function loginActivityRows(users=[],filter='never',now=new Date()){
  const minimum=/^\d+$/.test(String(filter))?Number(filter):null;
  return users.map((row)=>({...row,daysSince:daysSinceLogin(row.lastLogin,now),status:loginActivityStatus(row,now)}))
    .filter((row)=>filter==='all'||(filter==='never'?row.daysSince===null:row.daysSince===null||row.daysSince>=minimum))
    .sort((a,b)=>{
      if((a.daysSince===null)!==(b.daysSince===null))return a.daysSince===null?-1:1;
      if(a.daysSince!==b.daysSince)return (b.daysSince??0)-(a.daysSince??0);
      return String(a.name||a.login).localeCompare(String(b.name||b.login),undefined,{sensitivity:'base'});
    });
}
