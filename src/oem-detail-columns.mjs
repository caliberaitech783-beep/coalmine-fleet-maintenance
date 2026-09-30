// OEM-only layout: preserve cell indices so screen, print and export use the same data.
export function orderOemDetailColumns(columns) {
  const label = column => column.label.trim().toLowerCase();
  const adjacentLabels = ['delayed reason', 'daily remarks'];
  const meterLabels = ['opening hmr', 'opening kmr', 'closing hmr', 'closing kmr'];
  const adjacent = adjacentLabels.flatMap(name => columns.filter(column => label(column) === name));
  const meters = meterLabels.flatMap(name => columns.filter(column => label(column) === name));
  const ordered = columns.filter(column => !adjacent.includes(column) && !meters.includes(column));
  const reason = ordered.findIndex(column => label(column) === 'breakdown reason');
  ordered.splice(reason < 0 ? ordered.length : reason + 1, 0, ...adjacent);
  return [...ordered, ...meters];
}
