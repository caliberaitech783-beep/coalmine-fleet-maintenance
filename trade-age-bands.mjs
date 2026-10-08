export const TRADE_AGE_BANDS=[{value:'all',label:'All ages'},...Array.from({length:12},(_,i)=>({value:String((i+1)*30),label:`${i?i*30+1:0}–${(i+1)*30} days`,min:i?i*30+1:0,max:(i+1)*30})),{value:'older',label:'Above 360 days',min:361},{value:'future',label:'Future-dated document',max:-1},{value:'unknown',label:'Date unavailable'}];
export function tradeAgeBand(days){if(days==null)return 'unknown';if(days<0)return 'future';return TRADE_AGE_BANDS.find(b=>b.min!=null&&days>=b.min&&(b.max==null||days<=b.max))?.value;}
export function tradeAgeFilter(value='ledger'){
 if(value==='ledger')return null;
 const band=TRADE_AGE_BANDS.find(b=>b.value===value);if(!band)throw new Error('Choose a valid ageing range.');
 return {where:value==='all'?'1=1':value==='unknown'?'r.age_days IS NULL':value==='older'?'r.age_days>=361':value==='future'?'r.age_days<0':`r.age_days BETWEEN ${band.min} AND ${band.max}`};
}
