// Presentation only: format report dates without changing raw data or durations.
function reportDate(date) {
  return date.split('-').reverse().join('-');
}
export function reportTime12(value) {
  const text = String(value ?? '');
  const formattedTime = text.trim().match(/^(\d{4}-\d{2}-\d{2})(?:\s+((?:0?[1-9]|1[0-2]):[0-5]\d(?::[0-5]\d)?\s+[AP]M))?$/i);
  if (formattedTime) return `${reportDate(formattedTime[1])}${formattedTime[2] ? ` ${formattedTime[2]}` : ''}`;
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
  return `${reportDate(date)} ${Number(hour)%12 || 12}:${minute}${second === undefined ? '' : `:${second}`} ${Number(hour)>=12?'PM':'AM'}`;
}
