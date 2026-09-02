export const DASHBOARD_KPI_KEYS = ["assets", "roadstatus", "workload", "users"];

export const DEFAULT_DASHBOARD_LAYOUT = {
  order: DASHBOARD_KPI_KEYS,
  sizes: { assets: 1, roadstatus: 2, workload: 1, users: 1 },
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
  return { order, sizes };
}
