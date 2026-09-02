export const DASHBOARD_LAYOUT_VERSION = 2;
export const DASHBOARD_KPI_KEYS = ["assets", "roadstatus", "repairtypes", "intelligence", "workload", "users", "fleetregions", "trend"];

export const DEFAULT_DASHBOARD_LAYOUT = {
  order: DASHBOARD_KPI_KEYS,
  version: DASHBOARD_LAYOUT_VERSION,
  sizes: { assets: 3, roadstatus: 1, repairtypes: 2, intelligence: 3, workload: 1, users: 1, fleetregions: 3, trend: 3 },
  hidden: [],
};

export function normalizeDashboardLayout(value = {}) {
  if (value && Object.keys(value).length && value.version !== DASHBOARD_LAYOUT_VERSION) {
    return {...DEFAULT_DASHBOARD_LAYOUT, order:[...DEFAULT_DASHBOARD_LAYOUT.order], sizes:{...DEFAULT_DASHBOARD_LAYOUT.sizes}, hidden:[]};
  }
  const requestedOrder = Array.isArray(value.order) ? value.order : [];
  const order = [
    ...requestedOrder.filter((key, index) => DASHBOARD_KPI_KEYS.includes(key) && requestedOrder.indexOf(key) === index),
    ...DASHBOARD_KPI_KEYS.filter((key) => !requestedOrder.includes(key)),
  ];
  const requestedSizes = value.sizes && typeof value.sizes === "object" ? value.sizes : {};
  const sizes = Object.fromEntries(DASHBOARD_KPI_KEYS.map((key) => {
    const size = Number(requestedSizes[key]);
    return [key, Number.isInteger(size) ? Math.max(1, Math.min(3, size)) : DEFAULT_DASHBOARD_LAYOUT.sizes[key]];
  }));
  const requestedHidden = Array.isArray(value.hidden) ? value.hidden : [];
  const hidden = requestedHidden.filter((key, index) => DASHBOARD_KPI_KEYS.includes(key) && requestedHidden.indexOf(key) === index);
  return { version: DASHBOARD_LAYOUT_VERSION, order, sizes, hidden };
}
