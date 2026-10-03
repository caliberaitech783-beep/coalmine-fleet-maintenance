import React,{useEffect,useState} from 'react';

export default function TelegramSiteGroups({token}){
  const [data,setData]=useState(null),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
  async function request(path,body){
    const response=await fetch(`/api/telegram/site-groups${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Could not load Telegram site groups.');
    return result;
  }
  async function refresh(){
    setError('');
    try{setData(await request(''))}catch(error){setError(error.message)}
  }
  useEffect(()=>{refresh()},[token]);
  async function action(site,kind){
    setBusy(site);setError('');setNotice('');
    try{
      const result=await request(`/${kind}`,{site});
      setNotice(kind==='test'?`Test sent to ${site}.`:`${site}: ${result.invited} invited, ${result.alreadyMember} already joined, ${result.failed} failed.`);
    }catch(error){setError(error.message)}finally{setBusy('')}
  }
  return <section className="telegram-links">
    <h3>Site groups</h3>
    <p>Production, Maintenance, MIS and the site head share updates within their assigned site. Management keeps BDMS Admin Alert.</p>
    <p>To link a group, make CALIBER BDMS an administrator with permission to invite users, then send the command below from your connected BDMS administrator account in that group.</p>
    <button type="button" onClick={refresh} disabled={Boolean(busy)}>Refresh groups</button>
    {error&&<p role="alert" className="meta-whatsapp-feedback error">{error}</p>}
    {notice&&<p role="status" className="meta-whatsapp-feedback success">{notice}</p>}
    {data?<><div style={{overflowX:'auto'}}><table><thead><tr><th>Site</th><th>Group</th><th>Connected site users</th><th>Setup / invitations</th></tr></thead>
      <tbody>{data.groups.map(group=><tr key={group.site}><td>{group.site}</td><td>{group.title||'Not linked yet'}</td><td>{group.linkedUsers}</td><td>{group.chatId?<><button type="button" disabled={Boolean(busy)} onClick={()=>action(group.site,'invite')}>{busy===group.site?'Working…':'Invite assigned users'}</button>{' '}<button type="button" disabled={Boolean(busy)} onClick={()=>action(group.site,'test')}>Send site test</button></>:<code>/bdms_site {group.site}</code>}</td></tr>)}</tbody></table></div>
      <p>{data.unassignedUsers} connected users have no recognized site assignment. Update their site in Users &amp; employees before inviting them.</p>
      <p>Users tap their private invitation to join; the bot checks their current site assignment. If a user changes site after joining, the group administrator must review their existing membership.</p>
    </>:<p>Loading site groups…</p>}
  </section>;
}
