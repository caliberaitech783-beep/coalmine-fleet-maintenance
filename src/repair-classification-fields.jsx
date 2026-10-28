import React, {useState} from 'react';
import {REPAIR_TYPES, breakdownCategories, breakdownSubCategories} from '../repair-classification.mjs';

export function classificationFromForm(form) {
  return Object.fromEntries(['repairType', 'breakdownCategory', 'breakdownSubCategory'].map((key) => [key, String(form.get(key) || '').trim()]));
}

export default function RepairClassificationFields({initial = {}, required = false, onCategoryChange}) {
  const [repairType, setRepairType] = useState(initial.repairType || '');
  const [category, setCategory] = useState(initial.breakdownCategory || '');
  const [subCategory, setSubCategory] = useState(initial.breakdownSubCategory || '');
  const mark = required ? ' *' : ' (optional)';
  return <>
    <label>Repair type{mark}<select name="repairType" required={required} value={repairType} onChange={(event) => {setRepairType(event.target.value); setCategory(''); setSubCategory(''); onCategoryChange?.('');}}>
      <option value="">Select repair type</option>{REPAIR_TYPES.map((value) => <option key={value}>{value}</option>)}
    </select></label>
    <label>Breakdown Category{mark}<select name="breakdownCategory" required={required} disabled={!repairType} value={category} onChange={(event) => {setCategory(event.target.value); setSubCategory(''); onCategoryChange?.(event.target.value);}}>
      <option value="">{repairType ? 'Select breakdown category' : 'Select repair type first'}</option>{breakdownCategories(repairType).map((value) => <option key={value}>{value}</option>)}
    </select></label>
    <label>Breakdown Sub-category{mark}<select name="breakdownSubCategory" required={required} disabled={!category} value={subCategory} onChange={(event) => setSubCategory(event.target.value)}>
      <option value="">{category ? 'Select breakdown sub-category' : 'Select breakdown category first'}</option>{breakdownSubCategories(category).map((value) => <option key={value}>{value}</option>)}
    </select></label>
  </>;
}
