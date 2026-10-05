const hiddenReportOptions = new Set(['Stock Statement', 'Purchase Order', 'GRN Register', 'PO-GRN Reconciliation']);

export function userPermissionOptions(submenu) {
  return submenu.field === 'reportAccess'
    ? submenu.options.filter(option => !hiddenReportOptions.has(option))
    : submenu.options;
}

// Hiding a control must not revoke an existing permission when another field
// is edited, or when Select all is used for the remaining visible controls.
export function retainedHiddenPermissions(submenu, selected) {
  const visible = userPermissionOptions(submenu);
  return selected.filter(option => submenu.options.includes(option) && !visible.includes(option));
}
