// The enlarged band covers EVERY breakdown count in the chart, so all green
// segments are proportional (12 is 50% taller than 8). Only the remaining fleet
// range is compressed. Totals and grid use the same disclosed piecewise scale.
export function fleetBarHeightPercent(value, axisMax, enlargeLowCounts = false, breakdownMax = 25) {
  const count = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const scale = Math.max(1, Number.isFinite(Number(axisMax)) ? Number(axisMax) : 0, count);
  const linear = count / scale * 100;
  const bandMax = Math.max(5, Number.isFinite(Number(breakdownMax)) ? Number(breakdownMax) : 25);
  if (!enlargeLowCounts || scale <= bandMax) return linear;
  const lowerBand = Math.max(60, bandMax / scale * 100);
  return count <= bandMax ? count / bandMax * lowerBand : lowerBand + (count - bandMax) / (scale - bandMax) * (100 - lowerBand);
}
