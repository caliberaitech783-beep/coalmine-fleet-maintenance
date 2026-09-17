// Breakdown Sub-Category master: the owner's list of fault sub-categories.
// Seeded once into master_records; after that the Masters page owns it, so
// rows an administrator deletes or renames are never re-created on restart.
export const BREAKDOWN_SUB_CATEGORY_MASTER='Breakdown Sub-Category';
export const BREAKDOWN_SUB_CATEGORY_FIELD='subCategory';
export const BREAKDOWN_SUB_CATEGORY_DEFAULTS=Object.freeze([
  'Tyre puncture',
  'Leaf spring broken',
  'Hollow spring',
  'Steering system',
  'Brake system',
  'Air pressure leakage',
  'Gearbox problem',
  'Clutch',
  'Wheel stud',
  'Coolant leakage',
  'Radiator',
  'Engine overheating',
  'Low pick up',
  'Battery',
  'Starting problem',
  'Electrical fault',
  'Air conditioning',
  'Hydraulic system',
  'Travel device',
  'Swing motor',
  'Adaptor issue',
  'Bucket wornout',
  'Body hard facing',
  'Air compressor not working',
  'Solenoied not working',
  'Engine mounting wornout',
  'Bushing wornout',
  'Pin broken',
  'Undercarrage replacement',
  'Idler roller wornout',
  'Swing gear replacement',
  'Headlamps not working',
  'Bucket tooth wornout',
]);

/** Sub-category names from master records (or plain strings): trimmed, de-duplicated case-insensitively, sorted. */
export function breakdownSubCategoryNames(records=[]){
  const seen=new Map();
  for(const record of records){
    const name=String(typeof record==='string'?record:record?.[BREAKDOWN_SUB_CATEGORY_FIELD]??'').replace(/\s+/g,' ').trim();
    if(name&&!seen.has(name.toLowerCase()))seen.set(name.toLowerCase(),name);
  }
  return [...seen.values()].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
}
