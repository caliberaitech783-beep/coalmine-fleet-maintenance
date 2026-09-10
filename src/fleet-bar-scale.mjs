// Every bar, breakdown segment and grid line shares ONE linear scale, so bar
// heights are proportional to their counts (208 is four times 52, 48 is clearly
// taller than 31). Small breakdown segments stay visible through a CSS minimum
// height rather than by bending the axis. The trailing parameters are accepted
// for compatibility with older callers but no longer change the scale.
export function fleetBarHeightPercent(value, axisMax) {
  const count = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const scale = Math.max(1, Number.isFinite(Number(axisMax)) ? Number(axisMax) : 0, count);
  return count / scale * 100;
}
