export const DASHBOARD_KPI_KEYS = ["assets", "roadstatus", "workload", "users", "repairtypes", "fleetregions", "intelligence", "trend"];

export const DEFAULT_DASHBOARD_LAYOUT = {
  order: DASHBOARD_KPI_KEYS,
  sizes: { assets: 1, roadstatus: 2, workload: 1, users: 1, repairtypes: 3, fleetregions: 3, intelligence: 3, trend: 3 },
  hidden: [],
};

export function normalizeDashboardLayout(value = {}) {
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
  return { order, sizes, hidden };
}
