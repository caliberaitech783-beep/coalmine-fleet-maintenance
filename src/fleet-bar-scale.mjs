// A shared, explicitly labelled enlarged 0–5 band keeps small breakdown counts
// visible without per-bar minimum heights. Totals, segments and grid use this
// same increasing scale; a smaller count can never become a taller bar.
export function fleetBarHeightPercent(value, axisMax, enlargeLowCounts = false) {
  const count = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const scale = Math.max(1, Number.isFinite(Number(axisMax)) ? Number(axisMax) : 0, count);
  const linear = count / scale * 100;
  if (!enlargeLowCounts || scale <= 5) return linear;
  const lowerBand = Math.max(30, 5 / scale * 100);
  return count <= 5 ? count / 5 * lowerBand : lowerBand + (count - 5) / (scale - 5) * (100 - lowerBand);
}
