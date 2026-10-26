import sourceMappings from './breakdown-sub-category-data.json' with {type:'json'};
// Breakdown Sub-Category master: the owner's list of fault sub-categories.
// Seeded once into master_records; after that the Masters page owns it, so
// rows an administrator deletes or renames are never re-created on restart.
export const BREAKDOWN_SUB_CATEGORY_MASTER='Breakdown Sub-Category';
export const BREAKDOWN_SUB_CATEGORY_FIELD='subCategory';
// Imported from sub-category.xlsx, final!C2:D123. Administrators own subsequent edits.
export const BREAKDOWN_SUB_CATEGORY_MAPPINGS=Object.freeze(sourceMappings.map(row=>Object.freeze(row)));
export const BREAKDOWN_SUB_CATEGORY_DEFAULTS=Object.freeze(BREAKDOWN_SUB_CATEGORY_MAPPINGS.map(row=>row.subCategory));
const normalizeType=value=>String(value||'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export function subCategoriesForRepairType(repairType,records=[]){
  const key=normalizeType(repairType);
  if(!key)return [];
  return [...new Set(records.filter(row=>normalizeType(row?.repairType)===key).map(row=>String(row.subCategory||'').trim()).filter(Boolean))];
}
export function validateRequestSubCategory(category,value,records,{required=false}={}){
  const name=String(value??'').trim();
  if(!name){if(required)throw Object.assign(new Error('Select a sub-category for this repair type.'),{status:400});return '';}
  const match=subCategoriesForRepairType(category,records).find(option=>option.toLowerCase()===name.toLowerCase());
  if(!match)throw Object.assign(new Error('Select a sub-category belonging to the selected repair type.'),{status:400});
  return match;
}

// The catch-all fault: offered whenever the master has rows, and always the last option.
export const BREAKDOWN_SUB_CATEGORY_OTHERS='Others';
const isOthersName=(name)=>/^others?$/i.test(String(name).trim());

/** Sub-category names from master records (or plain strings): trimmed, de-duplicated case-insensitively, sorted, Others last. */
export function breakdownSubCategoryNames(records=[]){
  const seen=new Map();
  for(const record of records){
    const name=String(typeof record==='string'?record:record?.[BREAKDOWN_SUB_CATEGORY_FIELD]??'').replace(/\s+/g,' ').trim();
    if(name&&!seen.has(name.toLowerCase()))seen.set(name.toLowerCase(),name);
  }
  if(!seen.size)return [];
  const names=[...seen.values()],others=names.filter(isOthersName);
  return [...names.filter((name)=>!isOthersName(name)).sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})),others[0]||BREAKDOWN_SUB_CATEGORY_OTHERS];
}
