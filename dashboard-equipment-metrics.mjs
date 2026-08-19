export function equipmentMetrics(records = []) {
  const operational = records.filter(
    (record) => record.status === "Operational",
  ).length;
  return {
    total: records.length,
    onRoad: operational,
    offRoad: records.length - operational,
    availability: records.length
      ? Math.round((operational / records.length) * 100)
      : 0,
  };
}
