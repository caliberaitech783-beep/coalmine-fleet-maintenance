export function canViewTelegramUnlinkedReport(session={}) {
  return session.role==='super' && session.permissions?.adminLevel!=='Manager';
}

export function telegramUnlinkedRows(users=[],loginUsers=[]) {
  const loggedIn=new Map(loginUsers.filter(user=>user.lastLogin).map(user=>[String(user.login||'').trim().toLowerCase(),user.lastLogin]));
  return users.filter(user=>!user.linked && loggedIn.has(String(user.login||'').trim().toLowerCase())).map(user=>({...user,
    status:'Not linked', exemption:user.exempt?'Exempt':'Not exempt',
  })).sort((a,b)=>(a.site||'').localeCompare(b.site||'')||(a.name||a.login).localeCompare(b.name||b.login));
}
