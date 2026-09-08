// Presentation only: leave date-only values, durations and raw report data intact.
export function reportTime12(value) {
  const text = String(value ?? '');
  const match = text.trim().match(/^(\d{4}-\d{2}-\d{2})[ T·]+([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!match) return value;
  let [,date,hour,minute,second] = match;
  if (match[6]) {
    const instant = new Date(`${date}T${hour}:${minute}:${second || '00'}${match[5] || ''}${match[6]}`);
    if (!Number.isFinite(instant.getTime())) return value;
    const local = new Date(instant.getTime()+330*60000).toISOString();
    date=local.slice(0,10); hour=local.slice(11,13); minute=local.slice(14,16);
    if (second !== undefined) second=local.slice(17,19);
  }
  return `${date} ${Number(hour)%12 || 12}:${minute}${second === undefined ? '' : `:${second}`} ${Number(hour)>=12?'PM':'AM'}`;
}
