export function canViewTelegramUnlinkedReport(session={}) {
  return session.role==='super' && session.permissions?.adminLevel!=='Manager';
}

export function telegramUnlinkedRows(users=[]) {
  return users.filter(user=>!user.linked).map(user=>({...user,
    status:'Not linked', exemption:user.exempt?'Exempt':'Not exempt',
  })).sort((a,b)=>(a.site||'').localeCompare(b.site||'')||(a.name||a.login).localeCompare(b.name||b.login));
}
