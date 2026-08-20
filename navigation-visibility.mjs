export const MOBILE_NAVIGATION_ITEMS = [
  "Dashboard",
  "Masters",
  "Users & employees",
  "Equipment master",
  "Breakdown master",
  "Repair type master",
  "Region master",
  "Vehicle transfers",
  "Hierarchy master",
  "OEM master",
  "Privilege",
  "WhatsApp Integration",
  "Daily site-wise report",
  "Daily OEM report",
  "WhatsApp alert history",
  "Reports",
  "Audit Trail",
];

export function normalizeMobileNavigationVisibility(value = {}) {
  return Object.fromEntries(MOBILE_NAVIGATION_ITEMS.map((item) => [item, value?.[item] !== false]));
}
