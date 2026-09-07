// Counts share a zero baseline and five equal, whole-number grid intervals.
export function dashboardCountScale(values = []) {
  const peak = values.reduce((maximum, value) => Math.max(maximum, Number(value) || 0), 0);
  const targetStep = Math.max(1, peak / 5);
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude)
    .find((candidate) => Number.isInteger(candidate) && candidate >= targetStep);
  const maximum = step * 5;
  return { maximum, ticks: Array.from({ length: 6 }, (_, index) => index * step) };
}
