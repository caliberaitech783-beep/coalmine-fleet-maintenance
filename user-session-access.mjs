export function isSessionViewOnlyUser(session) {
  return String(session?.login || '').trim().toLowerCase() === 'mahakdudani';
}
export function canViewUserSessions(session) {
  return isSessionViewOnlyUser(session) || (session?.role === 'super'
    && ['admin','super admin'].includes(String(session?.permissions?.adminLevel || '').trim().toLowerCase()));
}
export function requireUserSessionView(req,res,next) {
  if (canViewUserSessions(req.session)) return next();
  return res.status(403).json({error:'You do not have access to User Sessions.'});
}
