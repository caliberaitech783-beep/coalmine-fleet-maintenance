import React,{useEffect,useMemo,useState} from 'react';
import {
  BookUser,Building2,Download,Eye,EyeOff,FilterX,LayoutDashboard,
  Network,RefreshCw,Search,TableProperties,TriangleAlert,UsersRound,X,
} from 'lucide-react';
import './caliber-directory-page.css';

const ALL='ALL';
const LEADERSHIP=[
  designation=>/chairman/i.test(designation),
  designation=>/^director$/i.test(designation),
  designation=>/vice president|^vp\b/i.test(designation),
  designation=>/chief financial officer|^cfo\b/i.test(designation),
  designation=>/company secretary|^cs\b/i.test(designation),
];
const SITE_LEADERSHIP=/\b(project manager|production manager|maintenance manager|manager mechanical|hr manager|site manager|store manager|manager|incharge|supervisor|head)\b/i;

const clean=value=>String(value||'').trim();
const unique=values=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
const statusOf=person=>clean(person.status).toUpperCase()||'ACTIVE';
const activePerson=person=>statusOf(person)!=='VACANT'&&Boolean(clean(person.name));
const officeSite=site=>/\b(head|corporate) office\b/i.test(clean(site?.label));
const rowKey=(person,index)=>`${person.siteId}|${person.cat}|${person._k||person.empId||person.name||index}`;
const maskPhone=value=>{const phone=clean(value);return phone.length>4?`${phone.slice(0,2)}${'•'.repeat(Math.max(4,phone.length-4))}${phone.slice(-2)}`:phone;};

function flattenDirectory(directory){
  const sitesById=Object.fromEntries((directory.sites||[]).map(site=>[site.id,site]));
  const rows=[];
  for(const [key,people] of Object.entries(directory.matrix||{})){
    const split=key.lastIndexOf('|');
    const siteId=key.slice(0,split),cat=key.slice(split+1),site=sitesById[siteId]||{};
    for(const person of people||[])rows.push({...person,siteId,siteLabel:site.label||siteId,region:site.group||'OTHER',cat});
  }
  return rows.sort((a,b)=>(directory.categories||[]).indexOf(a.cat)-(directory.categories||[]).indexOf(b.cat)||(b.rank||0)-(a.rank||0)||clean(a.name).localeCompare(clean(b.name)));
}

function csvCell(value){return `"${String(value??'').replaceAll('"','""')}"`;}
function exportRows(rows,redacted){
  const columns=[['Employee ID','empId'],['Name','name'],['Category','cat'],['Designation','designation'],['Department','department'],['Site / Office','siteLabel'],['Reports to','reportingTo'],['Contact','contact'],['Email','email'],['Status','status']];
  const lines=[columns.map(([label])=>csvCell(label)).join(',')];
  rows.forEach(row=>lines.push(columns.map(([,key])=>csvCell(key==='contact'&&redacted?maskPhone(row[key]):row[key])).join(',')));
  const blob=new Blob([`\ufeff${lines.join('\r\n')}`],{type:'text/csv;charset=utf-8'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`caliber-directory-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(link.href);
}

function DirectoryTable({rows,redacted,onSelect,empty='No employees match these filters.'}){
  if(!rows.length)return <div className="cdir-empty">{empty}</div>;
  return <div className="cdir-table-scroll"><table className="cdir-table">
    <thead><tr><th>Sr no</th><th>Name</th><th>Cat</th><th>Designation</th><th>Department</th><th>Site / Office</th><th>Reports to</th><th>Contact</th><th>Status</th></tr></thead>
    <tbody>{rows.map((person,index)=><tr key={rowKey(person,index)}>
      <td>{index+1}</td><td>{activePerson(person)?<button className="cdir-person-link" type="button" onClick={()=>onSelect(person)}>{person.name}</button>:<span className="cdir-vacant-name">Vacant position</span>}</td>
      <td><span className="cdir-cat">{person.cat||'—'}</span></td><td>{person.designation||'—'}</td><td>{person.department||'—'}</td><td>{person.siteLabel||'—'}</td><td>{person.reportingTo||'—'}</td>
      <td>{person.contact?(redacted?maskPhone(person.contact):<a href={`tel:${person.contact}`}>{person.contact}</a>):'—'}</td><td><span className={`cdir-status ${statusOf(person).toLowerCase()}`}>{statusOf(person)}</span></td>
    </tr>)}</tbody>
  </table></div>;
}

function ProfileDrawer({person,redacted,onClose}){
  if(!person)return null;
  const details=[['Employee ID',person.empId],['Category',person.cat],['Designation',person.designation],['Department',person.department],['Site / Office',person.siteLabel],['Reports to',person.reportingTo],['Contact',redacted?maskPhone(person.contact):person.contact],['WhatsApp',redacted?maskPhone(person.whatsapp):person.whatsapp],['Email',person.email],['Date of joining',person.doj],['Status',statusOf(person)]];
  return <div className="cdir-drawer-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><aside className="cdir-profile-drawer" role="dialog" aria-modal="true" aria-label={`${person.name} profile`}>
    <header><div className="cdir-avatar">{clean(person.name).split(/\s+/).slice(0,2).map(part=>part[0]).join('')}</div><div><small>Employee profile</small><h2>{person.name}</h2><p>{person.designation||'Designation not recorded'}</p></div><button type="button" onClick={onClose} aria-label="Close employee profile"><X/></button></header>
    <dl>{details.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'—'}</dd></div>)}</dl>
  </aside></div>;
}

function SummaryHero({meta,rows,leadershipCount,scopeLabel,mode='corporate'}){
  const sanctioned=rows.length,filled=rows.filter(person=>statusOf(person)==='ACTIVE').length,vacant=rows.filter(person=>statusOf(person)==='VACANT').length;
  const corporate=mode==='corporate';
  return <section className="cdir-hero">
    <div><span>{scopeLabel}</span><h2>{corporate?'Leadership Dashboard':'Site Overview'}</h2><p>Roster last updated: {meta.generated||'live from Masters'} · {corporate?'Order: Chairman & Managing Director → Director → Vice President → CFO → Company Secretary':'Showing the senior managers, incharges and supervisors recorded for the selected sites.'}</p></div>
    <div className="cdir-hero-stats"><article><span>Sanctioned</span><strong>{sanctioned}</strong></article><article><span>Filled</span><strong>{filled}</strong></article><article className="vacant"><span>Vacant</span><strong>{vacant}</strong></article><article><span>{corporate?'Leadership shown':'Site leaders shown'}</span><strong>{leadershipCount}</strong></article></div>
  </section>;
}

function ProjectManagerLeaderboard({rows}){
  const managers=[],seen=new Set();
  rows.filter(person=>activePerson(person)&&/\bproject manager\b/i.test(person.designation||'')).forEach(person=>{
    const key=`${person.name||person.empId}|${person.siteId}`;if(seen.has(key))return;seen.add(key);
    const team=rows.filter(member=>member.siteId===person.siteId);
    managers.push({person,filled:team.filter(member=>statusOf(member)==='ACTIVE').length,vacant:team.filter(member=>statusOf(member)==='VACANT').length,total:team.length});
  });
  managers.sort((a,b)=>b.filled-a.filled||a.vacant-b.vacant||clean(a.person.name).localeCompare(clean(b.person.name)));
  return <section className="cdir-section"><div className="cdir-section-head"><div><h2>Project Manager Site Coverage</h2><p>Directory coverage ranked by filled team positions. This is a staffing view, not a performance score.</p></div></div>
    {managers.length?<div className="cdir-table-scroll"><table className="cdir-table"><thead><tr><th>Rank</th><th>Project Manager</th><th>Site</th><th>Filled team</th><th>Vacant</th><th>Sanctioned</th></tr></thead><tbody>{managers.map((entry,index)=><tr key={`${entry.person.siteId}-${entry.person.name}`}><td><b>{index+1}</b></td><td><b>{entry.person.name}</b></td><td>{entry.person.siteLabel}</td><td>{entry.filled}</td><td>{entry.vacant}</td><td>{entry.total}</td></tr>)}</tbody></table></div>:<div className="cdir-empty">No Project Manager is assigned in this directory scope.</div>}
  </section>;
}

function MatrixView({directory,rows,onSite,onCategory}){
  const siteIds=new Set(rows.map(row=>row.siteId)),sites=(directory.sites||[]).filter(site=>siteIds.has(site.id));
  return <section className="cdir-section"><div className="cdir-section-head"><div><h2>Category × Site Matrix</h2><p>Select a count to open the matching directory records.</p></div></div><div className="cdir-table-scroll"><table className="cdir-table cdir-matrix"><thead><tr><th>Category</th>{sites.map(site=><th key={site.id}><button type="button" onClick={()=>onSite(site.id)}>{site.label}</button></th>)}<th>Total</th></tr></thead><tbody>{(directory.categories||[]).map(category=>{
    const counts=sites.map(site=>rows.filter(row=>row.siteId===site.id&&row.cat===category).length);return <tr key={category}><th><button type="button" onClick={()=>onCategory(category)}>{category}</button></th>{counts.map((count,index)=><td key={sites[index].id}>{count}</td>)}<td><b>{counts.reduce((sum,count)=>sum+count,0)}</b></td></tr>;
  })}</tbody></table></div></section>;
}

function OrganisationView({rows,onSelect}){
  const active=rows.filter(activePerson),leaders=active.filter(person=>!clean(person.reportingTo)),byManager=new Map();
  active.forEach(person=>{const manager=clean(person.reportingTo);if(!manager)return;if(!byManager.has(manager))byManager.set(manager,[]);byManager.get(manager).push(person);});
  const roots=leaders.length?leaders:active.filter(person=>byManager.has(clean(person.name))).slice(0,12);
  return <section className="cdir-section"><div className="cdir-section-head"><div><h2>Organisation Chart</h2><p>Reporting lines recorded in the employee master.</p></div></div><div className="cdir-org-grid">{roots.map(person=><article key={rowKey(person,0)}><button type="button" onClick={()=>onSelect(person)}><strong>{person.name}</strong><span>{person.designation||'—'}</span><small>{person.siteLabel}</small></button><div>{(byManager.get(clean(person.name))||[]).slice(0,8).map(report=><button type="button" key={rowKey(report,0)} onClick={()=>onSelect(report)}><b>{report.name}</b><span>{report.designation||'—'}</span></button>)}</div></article>)}</div>{!roots.length&&<div className="cdir-empty">No reporting relationships match these filters.</div>}</section>;
}

export default function CaliberDirectoryPage({token}){
  const [state,setState]=useState({loading:true,error:'',directory:null});
  const [attempt,setAttempt]=useState(0),[scope,setScope]=useState('assigned'),[view,setView]=useState('dashboard'),[redacted,setRedacted]=useState(true),[selected,setSelected]=useState(null);
  const [filters,setFilters]=useState({region:ALL,site:ALL,department:ALL,designation:ALL,category:ALL,name:''});
  useEffect(()=>{const controller=new AbortController();setState({loading:true,error:'',directory:null});fetch('/api/cdir/directory',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not load the directory.');if(!result.matrix)throw new Error('Directory records are unavailable.');setState({loading:false,error:'',directory:result});}).catch(error=>{if(!controller.signal.aborted)setState({loading:false,error:error.message,directory:null});});return()=>controller.abort();},[token,attempt]);
  const directory=state.directory,viewer=directory?.viewer||{};
  const allRows=useMemo(()=>directory?flattenDirectory(directory):[],[directory]);
  const scopeRows=allRows;
  const scopedSites=directory?.sites||[];
  const regionRows=useMemo(()=>scopeRows.filter(row=>filters.region===ALL||row.region===filters.region),[scopeRows,filters.region]);
  const siteOptions=useMemo(()=>scopedSites.filter(site=>filters.region===ALL?officeSite(site):site.group===filters.region),[scopedSites,filters.region]);
  const siteRows=useMemo(()=>regionRows.filter(row=>filters.site===ALL||row.siteId===filters.site),[regionRows,filters.site]);
  const departments=useMemo(()=>unique(siteRows.map(row=>clean(row.department))),[siteRows]);
  const departmentRows=useMemo(()=>siteRows.filter(row=>filters.department===ALL||clean(row.department)===filters.department),[siteRows,filters.department]);
  const designations=useMemo(()=>unique(departmentRows.map(row=>clean(row.designation))),[departmentRows]);
  const categoryBaseRows=useMemo(()=>{const query=clean(filters.name).toLowerCase();return departmentRows.filter(row=>(filters.designation===ALL||clean(row.designation)===filters.designation)&&(!query||[row.name,row.designation,row.department,row.empId,row.siteLabel].some(value=>clean(value).toLowerCase().includes(query))));},[departmentRows,filters.designation,filters.name]);
  const filteredRows=useMemo(()=>categoryBaseRows.filter(row=>filters.category===ALL||row.cat===filters.category),[categoryBaseRows,filters.category]);
  const corporateLeadership=useMemo(()=>{const result=[];LEADERSHIP.forEach(test=>filteredRows.filter(person=>person.designation&&test(clean(person.designation))).forEach(person=>result.push(person)));return result.slice(0,10);},[filteredRows]);
  const siteLeadership=useMemo(()=>{const active=filteredRows.filter(activePerson);const senior=active.filter(person=>SITE_LEADERSHIP.test(clean(person.designation)));return (senior.length?senior:active).sort((a,b)=>(b.rank||0)-(a.rank||0)||clean(a.siteLabel).localeCompare(clean(b.siteLabel))||clean(a.name).localeCompare(clean(b.name))).slice(0,10);},[filteredRows]);
  const overviewMode=corporateLeadership.length?'corporate':'site',leadership=corporateLeadership.length?corporateLeadership:siteLeadership;
  const vacancies=filteredRows.filter(person=>statusOf(person)==='VACANT');
  const rootScopeKey=viewer.allAccess?'all':'assigned';
  const setFilter=(key,value)=>{setFilters(current=>({...current,[key]:value,...(key==='region'?{site:ALL,department:ALL,designation:ALL}:{}) ,...(key==='site'?{department:ALL,designation:ALL}:{}) ,...(key==='department'?{designation:ALL}:{})}));if(key==='region')setScope(value===ALL?rootScopeKey:`region:${value}`);if(key==='site')setScope(value===ALL?(filters.region===ALL?rootScopeKey:`region:${filters.region}`):`site:${value}`);};
  const resetFilters=()=>{setFilters({region:ALL,site:ALL,department:ALL,designation:ALL,category:ALL,name:''});setScope(rootScopeKey);};
  const showAllPeople=()=>{resetFilters();setView('people');requestAnimationFrame(()=>document.getElementById('cdir-directory-views')?.scrollIntoView({behavior:'smooth',block:'start'}));};
  const openFiltered=(next)=>{const targetSite=next.site?(directory?.sites||[]).find(site=>site.id===next.site):null;const targetRegion=targetSite&&['WCL','NCL'].includes(targetSite.group)?targetSite.group:targetSite?ALL:next.region;setFilters(current=>({...current,...next,...(targetSite?{region:targetRegion,department:ALL,designation:ALL}:{})}));if(targetSite)setScope(`site:${targetSite.id}`);else if(next.region)setScope(next.region===ALL?rootScopeKey:`region:${next.region}`);setView('people');};
  if(state.loading)return <section className="caliber-directory-page"><div className="cdir-state"><RefreshCw className="spin"/><h2>Loading Caliber Directory</h2><p>Reading the current roster from Masters…</p></div></section>;
  if(state.error)return <section className="caliber-directory-page"><div className="cdir-state error"><TriangleAlert/><h2>Directory unavailable</h2><p>{state.error}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Try again</button></div></section>;
  const allSites=directory.sites||[];
  const scopeRegion=scope.startsWith('region:')?scope.slice(7):scope.startsWith('site:')?allSites.find(site=>site.id===scope.slice(5))?.group:'';
  const headOffice=allSites.find(site=>/\bhead office\b/i.test(site.label));
  const corporateOffice=allSites.find(site=>/\bcorporate office\b/i.test(site.label));
  const accessRegions=['WCL','NCL'].filter(region=>allSites.some(site=>site.group===region));
  const rootScope={key:rootScopeKey,label:viewer.allAccess?'All':allSites.length===1?'My site':'My access',detail:viewer.allAccess?'Every region and site':`${accessRegions.length} assigned region${accessRegions.length===1?'':'s'} · ${allSites.length} assigned site${allSites.length===1?'':'s'}`,icon:viewer.allAccess?Building2:UsersRound};
  const primaryScopeOptions=[
    rootScope,
    ...(headOffice?[{key:`site:${headOffice.id}`,label:headOffice.label,detail:'Head Office',icon:Building2}]:[]),
    ...(corporateOffice?[{key:`site:${corporateOffice.id}`,label:corporateOffice.label,detail:'Corporate Office',icon:Building2}]:[]),
    ...accessRegions.map(region=>({key:`region:${region}`,label:region,detail:`${allSites.filter(site=>site.group===region).length} assigned site${allSites.filter(site=>site.group===region).length===1?'':'s'}`,icon:Building2})),
  ];
  const regionalSiteOptions=accessRegions.includes(scopeRegion)?allSites.filter(site=>site.group===scopeRegion).map(site=>({key:`site:${site.id}`,label:site.label,detail:`${site.group} assigned site`,icon:Building2})):[];
  const scopeOptions=[...primaryScopeOptions,...regionalSiteOptions];
  const activeScope=scopeOptions.find(option=>option.key===scope)||scopeOptions[0];
  const scopeLabel=activeScope?.detail||'No sites assigned';
  const regionOptions=accessRegions;
  const browseHeadOffice=scopedSites.find(site=>/\bhead office\b/i.test(site.label));
  const browseCorporateOffice=scopedSites.find(site=>/\bcorporate office\b/i.test(site.label));
  const browseRegions=['WCL','NCL'].filter(region=>scopedSites.some(site=>site.group===region));
  const expandedBrowseRegion=browseRegions.includes(filters.region)?filters.region:'';
  const browseSiteRows=expandedBrowseRegion?scopedSites.filter(site=>site.group===expandedBrowseRegion):[];
  const selectScope=option=>{const site=option.key.startsWith('site:')?allSites.find(item=>item.id===option.key.slice(5)):null;const region=option.key.startsWith('region:')?option.key.slice(7):site&&accessRegions.includes(site.group)?site.group:ALL;setScope(option.key);setFilters({region:region||ALL,site:site?.id||ALL,department:ALL,designation:ALL,category:ALL,name:''});};
  const browseTo=(region=ALL,site=ALL)=>{setScope(site!==ALL?`site:${site}`:region!==ALL?`region:${region}`:rootScopeKey);setFilters(current=>({...current,region,site,department:ALL,designation:ALL}));};
  return <section className="caliber-directory-page" aria-label="Caliber Directory">
    <header className="cdir-page-head"><div><span className="cdir-page-icon"><BookUser/></span><div><p>C-Directory</p><h1>Employee Directory</h1><small>Live roster from Users &amp; Employees Masters · {directory.meta?.generated}</small></div></div><div className="cdir-head-actions"><span className={`cdir-profile-badge ${viewer.profile||'all-user'}`}><UsersRound/>{viewer.label||'All directory'}{(viewer.sites||[]).length>0&&<small>{viewer.sites.join(' · ')}</small>}</span><button type="button" onClick={()=>setRedacted(value=>!value)}>{redacted?<Eye/>:<EyeOff/>}{redacted?'Show contacts':'Hide contacts'}</button><button type="button" onClick={()=>exportRows(filteredRows,redacted)}><Download/>Export</button><button type="button" onClick={()=>setAttempt(value=>value+1)} aria-label="Refresh directory"><RefreshCw/></button></div></header>

    <section className="cdir-scope-panel" aria-label="Directory access scope"><div className="cdir-scope-row" role="tablist" aria-label="Regions and offices">{primaryScopeOptions.map(option=>{const Icon=option.icon;const count=option.key.startsWith('region:')?allRows.filter(row=>row.region===option.key.slice(7)).length:option.key.startsWith('site:')?allRows.filter(row=>row.siteId===option.key.slice(5)).length:allRows.length;const selected=(activeScope?.key||'')===option.key;const containsSelectedSite=scope.startsWith('site:')&&option.key===`region:${scopeRegion}`;return <button type="button" role="tab" key={option.key} aria-selected={selected} className={selected?'active':containsSelectedSite?'parent-active':''} onClick={()=>selectScope(option)}><Icon/><span><b>{option.label}</b><small>{option.detail}</small></span><em>{count}</em></button>})}</div>{regionalSiteOptions.length>0&&<div className="cdir-scope-sites"><strong>{scopeRegion} sites</strong><div role="tablist" aria-label={`${scopeRegion} sites`}>{regionalSiteOptions.map(option=>{const selected=(activeScope?.key||'')===option.key;const count=allRows.filter(row=>row.siteId===option.key.slice(5)).length;return <button type="button" role="tab" key={option.key} aria-selected={selected} className={selected?'active':''} onClick={()=>selectScope(option)}><Building2/><span>{option.label}</span><em>{count}</em></button>})}</div></div>}</section>

    <section className="cdir-filter-card"><div className="cdir-filter-title"><Search/><div><strong>Find people</strong><small>Filters apply in order: Region → Site / Office → Department → Designation → Name</small></div><button type="button" onClick={resetFilters}><FilterX/>Clear filters</button></div><div className="cdir-filter-grid">
      <label><span>Region</span><select value={filters.region} onChange={event=>setFilter('region',event.target.value)}><option value={ALL}>{viewer.allAccess?'All regions':'All assigned regions'}</option>{regionOptions.map(region=><option key={region} value={region}>{region}</option>)}</select></label>
      <label><span>Site / Office</span><select value={filters.site} onChange={event=>setFilter('site',event.target.value)}><option value={ALL}>{viewer.allAccess?'All sites and offices':'All assigned sites and offices'}</option>{siteOptions.map(site=><option key={site.id} value={site.id}>{site.label}</option>)}</select></label>
      <label><span>Department</span><select value={filters.department} onChange={event=>setFilter('department',event.target.value)}><option value={ALL}>All departments</option>{departments.map(value=><option key={value}>{value}</option>)}</select></label>
      <label><span>Designation</span><select value={filters.designation} onChange={event=>setFilter('designation',event.target.value)}><option value={ALL}>All designations</option>{designations.map(value=><option key={value}>{value}</option>)}</select></label>
      <label className="cdir-name-filter"><span>Name, ID or role</span><div><Search/><input value={filters.name} onChange={event=>setFilter('name',event.target.value)} placeholder="Search directory…"/></div></label>
    </div></section>

    <nav id="cdir-directory-views" className="cdir-view-nav" aria-label="Directory views">{[
      ['dashboard','Overview',LayoutDashboard],['people','Directory',UsersRound],['vacancies','Vacancies',TriangleAlert],['matrix','Category matrix',TableProperties],['organisation','Organisation chart',Network],
    ].map(([key,label,Icon])=><button type="button" key={key} className={view===key?'active':''} onClick={()=>setView(key)}><Icon/>{label}{key==='people'&&<span>{filteredRows.length}</span>}{key==='vacancies'&&<span>{vacancies.length}</span>}</button>)}</nav>

    <div className="cdir-browse"><div className="cdir-site-chips"><b>Browse:</b><button type="button" className={filters.region===ALL&&filters.site===ALL?'active':''} onClick={()=>browseTo()}>{viewer.allAccess?'All sites':'All assigned sites'} <span>{scopeRows.length}</span></button>{browseHeadOffice&&<button type="button" className={filters.site===browseHeadOffice.id?'active':''} onClick={()=>browseTo(ALL,browseHeadOffice.id)}>{browseHeadOffice.label} <span>{scopeRows.filter(row=>row.siteId===browseHeadOffice.id).length}</span></button>}{browseCorporateOffice&&<button type="button" className={filters.site===browseCorporateOffice.id?'active':''} onClick={()=>browseTo(ALL,browseCorporateOffice.id)}>{browseCorporateOffice.label} <span>{scopeRows.filter(row=>row.siteId===browseCorporateOffice.id).length}</span></button>}{browseRegions.map(region=><button type="button" className={filters.region===region?'active':''} key={region} onClick={()=>browseTo(region,ALL)}>{region} <span>{scopeRows.filter(row=>row.region===region).length}</span></button>)}</div>{expandedBrowseRegion&&<div className="cdir-site-chips cdir-region-sites"><b>{expandedBrowseRegion} sites:</b>{browseSiteRows.map(site=><button type="button" className={filters.site===site.id?'active':''} key={site.id} onClick={()=>browseTo(expandedBrowseRegion,site.id)}>{site.label} <span>{scopeRows.filter(row=>row.siteId===site.id).length}</span></button>)}</div>}</div>
    <div className="cdir-category-chips"><b>Category:</b><button type="button" className={filters.category===ALL?'active':''} onClick={()=>setFilter('category',ALL)}>All <span>{categoryBaseRows.length}</span></button>{(directory.categories||[]).map(category=><button type="button" className={filters.category===category?'active':''} key={category} onClick={()=>{setFilter('category',category);setView('people');}}>{category} <span>{categoryBaseRows.filter(row=>row.cat===category).length}</span></button>)}</div>

    {view==='dashboard'&&<><SummaryHero meta={directory.meta||{}} rows={filteredRows} leadershipCount={leadership.length} scopeLabel={scopeLabel} mode={overviewMode}/><section className="cdir-section"><div className="cdir-section-head"><div><h2>{overviewMode==='corporate'?'Leadership roster':'Site leadership roster'}</h2><p>{leadership.length} {overviewMode==='corporate'?'leadership':'senior site'} profile{leadership.length===1?'':'s'} in the selected scope.</p></div></div><DirectoryTable rows={leadership} redacted={redacted} onSelect={setSelected} empty="No active employee profiles match these filters."/></section><div className="cdir-show-all"><button type="button" onClick={showAllPeople}>Show all people <span aria-hidden="true">→</span></button></div>{(viewer.allAccess||viewer.profile==='project-manager')&&<ProjectManagerLeaderboard rows={filteredRows}/>}</>}
    {view==='people'&&<section className="cdir-section"><div className="cdir-section-head"><div><h2>{filters.site===ALL?'Employee directory':siteOptions.find(site=>site.id===filters.site)?.label||'Employee directory'}</h2><p>{filteredRows.length} sanctioned position{filteredRows.length===1?'':'s'} match the selected filters.</p></div><button type="button" onClick={()=>exportRows(filteredRows,redacted)}><Download/>Export current view</button></div><DirectoryTable rows={filteredRows} redacted={redacted} onSelect={setSelected}/></section>}
    {view==='vacancies'&&<section className="cdir-section"><div className="cdir-section-head"><div><h2>Vacancies</h2><p>{vacancies.length} vacant sanctioned position{vacancies.length===1?'':'s'} in the selected scope.</p></div><button type="button" onClick={()=>exportRows(vacancies,redacted)}><Download/>Export vacancies</button></div><DirectoryTable rows={vacancies} redacted={redacted} onSelect={setSelected} empty="No vacancies match these filters."/></section>}
    {view==='matrix'&&<MatrixView directory={directory} rows={filteredRows} onSite={site=>openFiltered({site})} onCategory={category=>openFiltered({category})}/>} {view==='organisation'&&<OrganisationView rows={filteredRows} onSelect={setSelected}/>}<ProfileDrawer person={selected} redacted={redacted} onClose={()=>setSelected(null)}/>
  </section>;
}
