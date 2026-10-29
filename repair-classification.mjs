// Source: sub-category.xlsx, sheet "final", D2:E134. Repair types in C46:C50
// form a separate option list; they are not row-level category restrictions.
import mappings from './repair-classification-data.json' with {type: 'json'};

export const REPAIR_CLASSIFICATION_START = '2026-10-28T17:00:00+05:30';
export const REPAIR_TYPES = ['Preventive', 'Breakdown', 'Accidental', 'Scheduled', 'WGM'];
export const classificationActive = (now = Date.now()) => new Date(now).getTime() >= Date.parse(REPAIR_CLASSIFICATION_START);
export function breakdownCategories(repairType) {
  if (!REPAIR_TYPES.includes(repairType)) return [];
  if (repairType === 'Scheduled') return ['SCHEDULED SERVICE', 'Other'];
  if (repairType === 'WGM') return ['WGM', 'Other'];
  return [...Object.keys(mappings).filter((category) => !['SCHEDULED SERVICE', 'WGM'].includes(category)), 'Other'];
}
export const breakdownSubCategories = (category) => category === 'Other' ? ['Other'] : mappings[category] ? [...mappings[category], 'Other'] : [];
export function normalizeClassification(input = {}) {
  return Object.fromEntries(['repairType', 'breakdownCategory', 'breakdownSubCategory'].map((key) => [key, String(input?.[key] || '').trim()]));
}
export function classificationError(input, required = false, masters) {
  const {repairType, breakdownCategory, breakdownSubCategory} = normalizeClassification(input);
  if (required && (!repairType || !breakdownCategory || !breakdownSubCategory)) return 'Select Repair type, Breakdown Category and Breakdown Sub-category.';
  if (!repairType && !breakdownCategory && !breakdownSubCategory) return '';
  if(masters){try{validateClassification(repairType,breakdownCategory,breakdownSubCategory,masters.categories,masters.mappings);return '';}catch(error){return error.message;}}
  if (!REPAIR_TYPES.includes(repairType)) return 'Select a valid Repair type.';
  if (breakdownCategory && !breakdownCategories(repairType).includes(breakdownCategory)) return 'Select a Breakdown Category allowed for this Repair type.';
  if (breakdownSubCategory && (!breakdownCategory || !breakdownSubCategories(breakdownCategory).includes(breakdownSubCategory))) return 'Select a Breakdown Sub-category mapped to this Breakdown Category.';
  return '';
}
// Only newly inserted requests receive version 1. Legacy requests never acquire
// it through editing, closure, a backdated start date or an existing-ticket resume.
export function newClassification(input, now = Date.now()) {
  return classificationActive(now) ? {version: 1, ...normalizeClassification(input)} : null;
}
export function updateClassification(existing, input) {
  return existing?.version === 1 ? {version: 1, ...normalizeClassification(input === undefined ? existing : input)} : null;
}

// Masters use the same workbook, preserving the deployed JSON classification format.
export const CLASSIFICATION_MAPPINGS=Object.freeze(Object.entries(mappings).flatMap(([breakdownCategory,names])=>names.map(subCategory=>Object.freeze({breakdownCategory,subCategory}))));
// Work types and component categories are separate levels. Legacy component
// labels remain stored for historical requests; they are not new work types.
const token = value => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
export function repairTypeKey(value) {
  const key = token(value);
  return ['scheduled', 'scheduledservice', 'scheduleservice'].includes(key) ? 'scheduled' : key;
}
export const isRepairType = value => REPAIR_TYPES.some(type => repairTypeKey(type) === repairTypeKey(value));
export function categoryLabel(value) {
  const key = token(value);
  if (['driveline', 'drivetrain', 'drivelineaggregate', 'aggregaterepair'].includes(key)) return 'DRIVELINE/AGGREGATE';
  if (['scheduledservice', 'scheduleservice'].includes(key)) return 'SCHEDULED SERVICE';
  return String(value || '').trim().toUpperCase();
}
export const categoryOfMapping = row => categoryLabel(row.breakdownCategory || row.repairType);
export function categoriesForRepairType(repairType, records = []) {
  const key = repairTypeKey(repairType);
  if (!isRepairType(repairType)) return [];
  return [...new Set(records.map(row => categoryLabel(typeof row === 'string' ? row : row.breakdownCategory)).filter(Boolean))]
    .filter(label => key === 'wgm' ? label === 'WGM' : key === 'scheduled' ? label === 'SCHEDULED SERVICE' : !['WGM', 'SCHEDULED SERVICE'].includes(label));
}
export function subCategoriesForCategory(category, records = []) {
  return [...new Set(records.filter(row => categoryOfMapping(row) === categoryLabel(category)).map(row => String(row.subCategory || '').trim()).filter(Boolean))];
}
export function validateClassification(repairType, category, subCategory, categories, mappings) {
  const fail = message => { throw Object.assign(new Error(message), {status: 400}); };
  if (!isRepairType(repairType)) fail('Select a valid repair type.');
  const label = categoriesForRepairType(repairType, categories).find(value => value === categoryLabel(category));
  if (!label) fail('Select a breakdown category belonging to the selected repair type.');
  const name = subCategoriesForCategory(label, mappings).find(value => value.toLowerCase() === String(subCategory || '').trim().toLowerCase());
  if (!name) fail('Select a breakdown sub-category belonging to the selected breakdown category.');
  return {breakdownCategory: label, subCategory: name};
}
export const requestCategoryLabel = request => categoryLabel(request.breakdownCategory || request.classification?.breakdownCategory) || 'Unclassified';
