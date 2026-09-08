import {createHash} from 'node:crypto';
import {META_WORKFLOW_TEMPLATES,baseTemplateKey,reportTemplateChoices,validateCustomTemplate,resolvedReportTemplateChoice} from './whatsapp-template-catalog.mjs';

export function candidateReportTemplate(purpose,selection={variant:'standard'}) {
  const base=META_WORKFLOW_TEMPLATES[baseTemplateKey(purpose)];
  if(!base)return null;
  if(selection.variant==='standard'||!selection.variant||base.otpButton)return base;
  const body=selection.variant==='custom'?selection.body:reportTemplateChoices(purpose).find(choice=>choice.variant===selection.variant)?.body;
  if(!body||validateCustomTemplate(purpose,body))return base;
  const fingerprint=createHash('sha256').update(`${purpose}\n${body}`).digest('hex').slice(0,16);
  return {...base,name:`bdms_${purpose.toLowerCase()}_${fingerprint}`,body};
}

export function requestedReportTemplate(purpose,settings) {
  const resolved=resolvedReportTemplateChoice(purpose,settings);
  return candidateReportTemplate(resolved.purpose,resolved.selection);
}

export function effectiveReportTemplate(purpose,settings,approvals={}) {
  const candidate=requestedReportTemplate(purpose,settings);
  const base=META_WORKFLOW_TEMPLATES[baseTemplateKey(purpose)];
  return candidate?.name===base?.name||approvals[candidate?.name]?.status==='APPROVED' ? candidate : base;
}

export function reportTemplateFallback(purpose,parameters,settings,approvals,standardMessage) {
  if(resolvedReportTemplateChoice(purpose,settings).selection.variant==='standard')return standardMessage;
  const template=effectiveReportTemplate(purpose,settings,approvals);
  return template?.body?template.body.replace(/\{\{(\d+)\}\}/g,(_,index)=>String(parameters[Number(index)-1]??'')):standardMessage;
}
