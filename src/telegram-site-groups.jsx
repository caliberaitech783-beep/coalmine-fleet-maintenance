import React,{useEffect,useState} from 'react';
import {beginDownload} from './download-notice.mjs';

export default function TelegramSiteGroups({token}){
  const [data,setData]=useState(null),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[campaign,setCampaign]=useState(null);
  async function request(path,body){
    const response=await fetch(`/api/telegram/site-groups${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    let result;
    try{result=await response.json()}catch{throw new Error('The server response was interrupted. Refresh groups to check saved invitation progress before continuing.')}
    if(!response.ok)throw new Error(result.error||'Could not load Telegram site groups.');
    return result;
  }
  async function refresh(){
    setError('');
    try{setData(await request(''))}catch(error){setError(error.message)}
  }
  useEffect(()=>{refresh()},[token]);
  function download(value,name,downloadNotice=beginDownload('Telegram JSON export')){
    try{
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    downloadNotice.success();
    }catch(error){downloadNotice.error(error);throw error;}
  }
  async function exportUsers(){
    const downloadNotice=beginDownload('Telegram users');
    setBusy('export');setError('');
    try{download(await request('/export'),'Caliber Pulse-site-group-users.json',downloadNotice)}catch(error){downloadNotice.error(error);setError(error.message)}finally{setBusy('')}
  }
  async function sendCampaign(campaignId){
    setBusy('campaign');setError('');setNotice('');
    try{
      let result;
      do{result=await request('/campaign',campaignId?{campaign:campaignId}:{});setCampaign(result);setNotice(`${campaignId?'Oct 5 resend campaign':'Site joining campaign'}: ${result.sent} sent, ${result.failed} failed, ${result.uncertain} uncertain, ${result.pending} pending.`)}while(result.pending>0);
      download(result,campaignId?'Caliber Pulse-site-joining-resend-2026-10-05-results.json':'Caliber Pulse-site-joining-delivery-results.json');
    }catch(error){setError(error.message)}finally{setBusy('')}
  }
  async function action(site,kind){
    setBusy(site);setError('');setNotice('');
    try{
      let result=await request(`/${kind}`,{site});
      while(kind==='invite'&&result.pending>0){
        setNotice(`${site}: ${result.invited} invited; ${result.pending} remaining.`);
        result=await request('/invite',{site});
      }
      setNotice(kind==='test'?`Test sent to ${site}.`:`${site}: ${result.invited} invited, ${result.alreadyMember} already joined, ${result.failed} failed, ${result.uncertain} uncertain.`);
      await refresh();
    }catch(error){setError(error.message)}finally{setBusy('')}
  }
  return <section className="telegram-links">
    <h3>Site groups</h3>
    <p>Production, Maintenance, MIS and the site head share updates within their assigned site. Management keeps Caliber Pulse Admin Alert.</p>
    <p>To link a group, make CALIBER PULSE an administrator with permission to invite users, then send the command below from your connected Caliber Pulse administrator account in that group.</p>
    <button type="button" onClick={refresh} disabled={Boolean(busy)}>Refresh groups</button>
    {' '}<button type="button" onClick={exportUsers} disabled={Boolean(busy)}>Export users and invitation links</button>
    {' '}<button type="button" onClick={()=>sendCampaign()} disabled={Boolean(busy)}>Send one-time joining links to all assigned users</button>
    {' '}<button type="button" onClick={()=>sendCampaign('site-joining-resend-2026-10-05')} disabled={Boolean(busy)}>Resend invitations to all assigned users — Oct 5</button>
    <p>The one-time campaign sends one message per connected Telegram account with its assigned site links. Saved attempts are never sent again by this button.</p>
    <p>The Oct 5 resend sends a fresh invitation to every currently assigned account, including recipients of the original campaign. Its separate saved history prevents duplicate resends if you continue after an interruption.</p>
    {campaign&&<><button type="button" onClick={()=>download(campaign,'Caliber Pulse-site-joining-delivery-results.json')}>Download campaign results</button>{campaign.rows.some(row=>['Failed','Uncertain','Sending'].includes(row.status))&&<table><thead><tr><th>User</th><th>Login</th><th>Delivery</th><th>Review</th></tr></thead><tbody>{campaign.rows.filter(row=>['Failed','Uncertain','Sending'].includes(row.status)).map(row=><tr key={row.login}><td>{row.name}</td><td>{row.login}</td><td>{row.status}</td><td>{row.reason}</td></tr>)}</tbody></table>}</>}
    {error&&<p role="alert" className="meta-whatsapp-feedback error">{error}</p>}
    {notice&&<p role="status" className="meta-whatsapp-feedback success">{notice}</p>}
    {data?<><div style={{overflowX:'auto'}}><table><thead><tr><th>Site</th><th>Group</th><th>Connected site users</th><th>Setup / invitations</th></tr></thead>
      <tbody>{data.groups.map(group=><tr key={group.site}><td>{group.site}</td><td>{group.title||'Not linked yet'}</td><td>{group.linkedUsers}</td><td>{group.chatId?<><button type="button" disabled={Boolean(busy)} onClick={()=>action(group.site,'invite')}>{busy===group.site?'Working…':'Invite assigned users'}</button>{' '}<button type="button" disabled={Boolean(busy)} onClick={()=>action(group.site,'test')}>Send site test</button>{group.invitations&&<div>{group.invitations.invited} invited · {group.invitations.alreadyMember} joined at invitation check · {group.invitations.failed} failed · {group.invitations.uncertain} uncertain · {group.invitations.pending} pending</div>}</>:<code>/bdms_site {group.site}</code>}</td></tr>)}</tbody></table></div>
      <p>Invitation progress is saved in small batches. Refresh and continue after an interrupted response; recorded attempts are not sent again. Failed or uncertain deliveries need administrator review. Counts cover invitations recorded since delivery tracking was enabled.</p>
      <p>{data.unassignedUsers} connected users have no recognized site assignment. Update their site in Users &amp; employees before inviting them.</p>
      <p>Users tap their private invitation to join; the bot checks their current site assignment. If a user changes site after joining, the group administrator must review their existing membership.</p>
    </>:<p>Loading site groups…</p>}
  </section>;
}
