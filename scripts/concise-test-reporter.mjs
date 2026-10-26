export default async function* report(events){
  for await(const event of events){
    if(event.type==='test:fail')yield JSON.stringify({failed:event.data.name,file:event.data.file,message:String(event.data.details?.error?.message||'').slice(0,400)})+'\n';
    if(event.type==='test:summary'&&!event.data.file)yield JSON.stringify({summary:event.data})+'\n';
  }
}
