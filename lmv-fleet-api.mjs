import {accessAllows} from './admin-access.mjs';
import {generalUserCanAccessMenu} from './mobile-access.mjs';
import {canReadDashboardEquipment,dashboardEquipmentScope,dashboardEquipmentScopeIsUsable,scopeDashboardEquipmentRecords} from './dashboard-equipment-access.mjs';
import {lmvFleetSnapshot} from './lmv-fleet.mjs';

export function registerLmvFleet(app,{pool,requireSession,currentDashboardAuthorization}) {
  app.get('/api/lmv-fleet',requireSession,async(req,res,next)=>{
    try {
      res.set('Cache-Control','private, no-store');res.vary('Authorization');
      const authorization=await currentDashboardAuthorization(req.session);
      if(!authorization)return res.status(401).json({error:'Your sign-in has expired. Please sign in again.'});
      const {session,user}=authorization;
      const reportsAllowed=session.role==='super'
        ?accessAllows(session.permissions?.tabAccess,'Reports')||accessAllows(session.permissions?.mobileTabAccess,'Reports')
        :session.role==='normal'&&(['Production User','Maintenance User','MIS User'].includes(session.assignedRole)||(session.assignedRole==='General User'&&generalUserCanAccessMenu(session,'Reports')));
      if(!canReadDashboardEquipment(session)&&!reportsAllowed)return res.status(403).json({error:'You do not have access to LMV fleet reports.'});
      const scope=dashboardEquipmentScope(session,user);
      if(!dashboardEquipmentScopeIsUsable(scope))return res.status(409).json({error:'No LMV report site is assigned to this account.'});
      const {rows:masters}=await pool.query("SELECT id,record_data FROM master_records WHERE master_name='LMV master' ORDER BY created_at ASC");
      const records=masters.map(row=>({...row.record_data,id:row.id}));
      // Resolve against every active case before applying current-site scope;
      // transferred LMVs retain live availability without exposing case details.
      const {rows:requests}=await pool.query(`SELECT reference AS ref,equipment_name AS equipment,equipment_group AS "equipmentGroup",
        door_number AS door,registration_number AS reg,chassis_number AS chassis,site,status,vehicle_idle AS "vehicleIdle",
        oem_responsibility AS "oemResponsibility",delayed_reason AS "delayedReason"
        FROM maintenance_requests WHERE archived_at IS NULL AND (lower(trim(status))<>'closed' OR vehicle_idle=TRUE)`);
      const rows=scopeDashboardEquipmentRecords(lmvFleetSnapshot(records,requests),session,user,scope);
      res.json({records:rows,scope,generatedAt:new Date().toISOString(),basis:'Current live LMV status; labelled demos use sample status'});
    }catch(error){next(error);}
  });
}
