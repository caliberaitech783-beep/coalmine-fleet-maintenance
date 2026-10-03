// Coalesce identical requests; only successful Oracle snapshots are cached.
export function dashboardCache({ttl=600000,maxEntries=24,now=Date.now}={}) {
 const entries=new Map(),pending=new Map();
 return async(key,load)=>{
  const saved=entries.get(key);
  if(saved&&now()-saved.at<ttl)return saved.value;
  if(pending.has(key))return pending.get(key);
  const work=Promise.resolve().then(load).then(value=>{
   entries.delete(key);entries.set(key,{value,at:now()});
   while(entries.size>maxEntries)entries.delete(entries.keys().next().value);
   return value;
  }).finally(()=>pending.delete(key));
  pending.set(key,work);return work;
 };
}
