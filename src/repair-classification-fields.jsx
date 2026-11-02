import React, {useState} from 'react';
import {REPAIR_TYPES, breakdownCategories, breakdownSubCategories,categoriesForRepairType,subCategoriesForCategory,categoryLabel,repairTypeKey} from '../repair-classification.mjs';

export function classificationFromForm(form) {
  const classification=Object.fromEntries(['repairType', 'breakdownCategory', 'breakdownSubCategory'].map((key) => [key, String(form.get(key) || '').trim()]));
  if(form.get('breakdownSubCategoryCustom')==='true')classification.customSubCategory=true;
  return classification;
}

export default function RepairClassificationFields({initial = {}, required = false, onCategoryChange, categoryRecords, subCategoryRecords, loading=false}) {
  const [repairType, setRepairType] = useState(initial.repairType || '');
  const [category, setCategory] = useState(initial.breakdownCategory || '');
  const [subCategory, setSubCategory] = useState(initial.breakdownSubCategory || '');
  const [customSubCategory,setCustomSubCategory]=useState(initial.customSubCategory ? initial.breakdownSubCategory || '' : '');
  const [replaceSavedOther,setReplaceSavedOther]=useState(false);
  const restricted=['wgm','scheduled'].includes(repairTypeKey(repairType));
  const isOther=value=>/^others?$/i.test(String(value||'').trim());
  const visibleOption=value=>!restricted||!isOther(value);
  const categories=(categoryRecords?categoriesForRepairType(repairType,categoryRecords):breakdownCategories(repairType)).filter(visibleOption);
  const selectedCategory=category || (categories.length===1?categories[0]:'');
  const customAllowed=['preventive','breakdown','accidental'].includes(repairTypeKey(repairType));
  const mappedOptions=(subCategoryRecords?subCategoriesForCategory(selectedCategory,subCategoryRecords):breakdownSubCategories(selectedCategory)).filter(visibleOption).filter(value=>!isOther(value));
  const options=customAllowed&&selectedCategory?[...mappedOptions,'Other']:mappedOptions;
  const initialIsCustom=customAllowed&&category===initial.breakdownCategory&&subCategory===initial.breakdownSubCategory&&(initial.customSubCategory||Boolean(subCategory&&!mappedOptions.includes(subCategory)));
  const selectedSubCategory=repairTypeKey(repairType)==='wgm'&&selectedCategory==='WGM'&&options.includes('WGM')?'WGM':options.includes(subCategory)?subCategory:initialIsCustom?'Other':'';
  const preserveSavedOther=restricted&&!replaceSavedOther&&repairType===initial.repairType&&(isOther(initial.breakdownCategory)||isOther(initial.breakdownSubCategory));
  if(preserveSavedOther)return <div className="saved-repair-classification" role="note">
    <p>Saved classification: {initial.repairType} → {initial.breakdownCategory} → {initial.breakdownSubCategory}. These saved values will be retained unless you choose a replacement.</p>
    {['repairType','breakdownCategory','breakdownSubCategory'].map(name=><input key={name} type="hidden" name={name} value={initial[name]||''} />)}
    <button type="button" onClick={()=>{setReplaceSavedOther(true);setCategory('');setSubCategory('');}}>Change classification</button>
  </div>;
  const mark = required ? ' *' : ' (optional)';
  return <>
    <label>Repair type{mark}<select name="repairType" required={required} disabled={loading} value={repairType} onChange={(event) => {setRepairType(event.target.value); setCategory(''); setSubCategory(''); setCustomSubCategory(''); onCategoryChange?.('');}}>
      <option value="">Select repair type</option>{REPAIR_TYPES.map((value) => <option key={value}>{value}</option>)}
    </select></label>
    <label>Breakdown Category{mark}<select name="breakdownCategory" required={required} disabled={!repairType||loading} value={selectedCategory} onChange={(event) => {setCategory(event.target.value); setSubCategory(''); setCustomSubCategory(''); onCategoryChange?.(event.target.value);}}>
      <option value="">{repairType ? 'Select breakdown category' : 'Select repair type first'}</option>{initial.breakdownCategory && visibleOption(initial.breakdownCategory) && !categories.includes(categoryLabel(initial.breakdownCategory)) && category===initial.breakdownCategory && <option value={initial.breakdownCategory}>{initial.breakdownCategory}</option>}{categories.map((value) => <option key={value}>{value}</option>)}
    </select></label>
    <label>Breakdown Sub-category{mark}<select name={selectedSubCategory==='Other'?'breakdownSubCategoryChoice':'breakdownSubCategory'} required={required} disabled={!selectedCategory||loading} value={selectedSubCategory} onChange={(event) => {setSubCategory(event.target.value);if(event.target.value!=='Other')setCustomSubCategory('');}}>
      <option value="">{selectedCategory ? 'Select breakdown sub-category' : 'Select breakdown category first'}</option>{Boolean(selectedSubCategory)&&visibleOption(selectedSubCategory)&&!options.includes(selectedSubCategory)&&<option value={selectedSubCategory}>{selectedSubCategory}</option>}{options.map((value) => <option key={value}>{value}</option>)}
    </select></label>
    {selectedSubCategory==='Other'&&<label>Other Breakdown Sub-category{mark}<input autoFocus name="breakdownSubCategory" required={required} value={customSubCategory} onChange={event=>setCustomSubCategory(event.target.value)} placeholder="Enter breakdown sub-category" /></label>}
    {selectedSubCategory==='Other'&&<input type="hidden" name="breakdownSubCategoryCustom" value="true" />}
  </>;
}
