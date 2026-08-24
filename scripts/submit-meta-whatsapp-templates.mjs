import {metaWhatsAppTemplateStatuses,submitMetaWhatsAppTemplates} from '../meta-whatsapp.mjs';

const command=process.argv[2]||'submit';
try{
  const results=command==='status'
    ? await metaWhatsAppTemplateStatuses()
    : await submitMetaWhatsAppTemplates();
  console.log(JSON.stringify(results.map(({id,name,status,category,language,existing})=>({id,name,status,category,language,existing})),null,2));
}catch(error){
  console.error(error instanceof Error?error.message:'Meta template operation failed.');
  process.exitCode=1;
}
