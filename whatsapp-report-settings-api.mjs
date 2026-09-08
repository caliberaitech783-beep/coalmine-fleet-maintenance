import {normalizeWhatsAppReportSettings,whatsappSettingsValidationError,PURPOSE_OPTIONS} from './whatsapp-report-settings.mjs';
import {validateCustomTemplate} from './whatsapp-template-catalog.mjs';
import {requestedReportTemplate,effectiveReportTemplate} from './whatsapp-template-runtime.mjs';

export function canManageWhatsAppReports(session={}) {
  return session.role==='super'&&['Admin','Super Admin'].includes(session.permissions?.adminLevel);
}

export function registerWhatsAppReportSettingsApi(app,{requireSession,authorize,read,save,syncTemplates}) {
  const handler=work=>async(req,res,next)=>{
    try{
      const authorization=await authorize(req.session);
      if(!authorization||!canManageWhatsAppReports(authorization.session))return res.status(403).json({error:'Only Admin and Super Admin accounts can manage Report settings.'});
      res.set('Cache-Control','private, no-store');res.vary('Authorization');
      await work(req,res);
    }catch(error){if(error.status===409)return res.status(409).json({error:error.message});next(error);}
  };
  app.get('/api/report-settings',requireSession,handler(async(_req,res)=>res.json(await read())));
  app.put('/api/report-settings',requireSession,handler(async(req,res)=>{
    const input=req.body?.settings;
    let error=whatsappSettingsValidationError(input);
    if(!error)for(const {key} of PURPOSE_OPTIONS){if(input.templates[key].variant==='custom'){error=validateCustomTemplate(key,input.templates[key].body);if(error)break;}}
    if(error)return res.status(400).json({error});
    await save(normalizeWhatsAppReportSettings(input),req.body.revision);
    req.audit={eventType:'Integration',module:'Reports',action:'Save WhatsApp report settings',targetType:'WhatsApp delivery',changedFields:[]};
    res.json(await read());
  }));
  app.post('/api/report-settings/templates',requireSession,handler(async(req,res)=>{
    if(!['submit','refresh'].includes(req.body?.action))return res.status(400).json({error:'Choose Submit templates or Refresh approval status.'});
    await syncTemplates(req.body.action);
    req.audit={eventType:'Integration',module:'Reports',action:req.body.action==='submit'?'Submit WhatsApp template choices':'Refresh WhatsApp template approval',targetType:'WhatsApp templates',changedFields:[]};
    res.json(await read());
  }));
}

export function reportTemplateState(settings,approvals) {
  return Object.fromEntries(PURPOSE_OPTIONS.map(({key})=>{
    const candidate=requestedReportTemplate(key,settings),effective=effectiveReportTemplate(key,settings,approvals);
    return [key,{name:candidate.name,status:approvals[candidate.name]?.status||'NOT_CHECKED',checkedAt:approvals[candidate.name]?.checkedAt||null,
      usingRequested:candidate.name===effective.name,effectiveName:effective.name}];
  }));
}
