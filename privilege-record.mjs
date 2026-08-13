const permissionFields = ["read", "edit", "delete", "verify", "print"];
const selectionFields = ["accessType", "location", "userGroup"];
const legacyFlagValues = new Set([
  "true",
  "false",
  "yes",
  "no",
  "1",
  "0",
  "enabled",
  "checked",
]);

export function privilegeEnabled(value) {
  return value === true || ["true", "yes", "1", "enabled", "checked"].includes(
    String(value ?? "").trim().toLowerCase(),
  );
}

function selectedText(value) {
  if (typeof value !== "string") return "";
  const selected = value.trim();
  return legacyFlagValues.has(selected.toLowerCase()) ? "" : selected;
}

export function mergePrivilegeRecords(current = {}, duplicate = {}) {
  const merged = { ...current };
  for (const field of permissionFields) {
    merged[field] = privilegeEnabled(current[field]) || privilegeEnabled(duplicate[field]);
  }
  for (const field of selectionFields) {
    const currentValue = selectedText(current[field]);
    const duplicateValue = selectedText(duplicate[field]);
    merged[field] = currentValue || duplicateValue;
  }
  return merged;
}
