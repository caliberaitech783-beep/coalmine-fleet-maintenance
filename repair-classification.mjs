// Source: sub-category.xlsx, sheet "final", D2:E134. Repair types in C46:C50
// form a separate option list; they are not row-level category restrictions.
import mappings from './repair-classification-data.json' with {type: 'json'};

export const REPAIR_CLASSIFICATION_START = '2026-10-28T17:00:00+05:30';
export const REPAIR_TYPES = ['Preventive', 'Breakdown', 'Accidental', 'Scheduled', 'WGM'];
export const classificationActive = (now = Date.now()) => new Date(now).getTime() >= Date.parse(REPAIR_CLASSIFICATION_START);
export function breakdownCategories(repairType) {
  if (!REPAIR_TYPES.includes(repairType)) return [];
  if (repairType === 'Scheduled') return ['SCHEDULED SERVICE'];
  if (repairType === 'WGM') return ['WGM'];
  return Object.keys(mappings).filter((category) => !['SCHEDULED SERVICE', 'WGM'].includes(category));
}
export const breakdownSubCategories = (category) => mappings[category] || [];
export function normalizeClassification(input = {}) {
  return Object.fromEntries(['repairType', 'breakdownCategory', 'breakdownSubCategory'].map((key) => [key, String(input?.[key] || '').trim()]));
}
export function classificationError(input, required = false) {
  const {repairType, breakdownCategory, breakdownSubCategory} = normalizeClassification(input);
  if (required && (!repairType || !breakdownCategory || !breakdownSubCategory)) return 'Select Repair type, Breakdown Category and Breakdown Sub-category.';
  if (!repairType && !breakdownCategory && !breakdownSubCategory) return '';
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
