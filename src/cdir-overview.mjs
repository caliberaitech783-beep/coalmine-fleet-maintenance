const clean=value=>String(value||'').trim();
export function directoryLeadership(rows=[]){
  return rows.filter(person=>['A','A1'].includes(clean(person.cat).toUpperCase()) && clean(person.status).toUpperCase()!=='VACANT' && clean(person.name))
    .sort((a,b)=>clean(a.cat).toUpperCase().localeCompare(clean(b.cat).toUpperCase()) || (Number(b.rank)||0)-(Number(a.rank)||0) || clean(a.name).localeCompare(clean(b.name)));
}
export function directorySiteTabs(sites=[],viewer={}){
  const assigned=new Set(viewer.siteIds||[]);
  return sites.filter(site=>assigned.has(site.id) && !/\b(head|corporate) office\b/i.test(clean(site.label)));
}
