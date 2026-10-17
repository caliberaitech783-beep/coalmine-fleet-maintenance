export const PERCENTAGE_REPORT_TITLE = 'Percentage Report';
export const percentageColumns = [
  {key:'repairCategory',label:'Repair category',value:row=>row.repairCategory},
  {key:'count',label:'Breakdown requests',value:row=>row.count},
  {key:'total',label:'Total matching requests',value:row=>row.total},
  {key:'percentage',label:'Percentage',value:row=>`${row.percentage.toFixed(2)}%`,sortValue:row=>row.percentage},
];
export function repairPercentageRows(requests = []) {
  const groups = new Map();
  const eligible = requests.filter(row=>!row.archivedAt && !row.archived_at);
  for (const row of eligible) {
    const label = String(row.category || '').trim().replace(/\s+/g,' ') || 'Not specified';
    const key = label.toLowerCase();
    const group = groups.get(key) || {repairCategory:label,count:0};
    group.count++;
    groups.set(key,group);
  }
  return [...groups.values()].map(row=>({...row,total:eligible.length,percentage:row.count/eligible.length*100}))
    .sort((a,b)=>b.count-a.count || a.repairCategory.localeCompare(b.repairCategory));
}
