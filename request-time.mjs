export const TIME_24H_PATTERN = "(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]";

export function isValidTime24(value) {
  return new RegExp(`^${TIME_24H_PATTERN}$`).test(String(value || ""));
}

export function parseIndiaRequestDateTime(value, fallback = new Date()) {
  const match = String(value || "").match(
    /^(\d{4}-\d{2}-\d{2})\s*(?:·|Â·)\s*((?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9])$/,
  );
  if (!match) return fallback;

  const parsed = new Date(`${match[1]}T${match[2]}+05:30`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
