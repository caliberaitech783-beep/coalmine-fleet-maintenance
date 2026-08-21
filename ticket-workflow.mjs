export const TICKET_CATEGORIES = ["General", "Production", "Maintenance", "MIS", "Equipment", "System access"];

const dataUrlPattern = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/;

export function validTicketMediaDataUrl(value, {kind = "attachment"} = {}) {
  if (!value) return true;
  const match = String(value).match(dataUrlPattern);
  if (!match) return false;
  const mime = match[1].toLowerCase();
  const bytes = Math.floor(match[2].length * 3 / 4);
  if (kind === "audio") return ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"].includes(mime) && bytes <= 3 * 1024 * 1024;
  return (["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(mime)) && bytes <= 10 * 1024 * 1024;
}

export function ticketSiteSlug(site) {
  return String(site || "UNASSIGNED").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "UNASSIGNED";
}

export function ticketReference({site, date = new Date(), number}) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "2-digit"}).formatToParts(date).map(({type,value}) => [type,value]));
  const {day,month,year} = parts;
  return `TIC/${ticketSiteSlug(site)}/${day}${month}${year}/${String(number).padStart(6, "0")}`;
}

export function managerUserRole(managerRole) {
  return String(managerRole || "").replace(/ Manager$/, " User");
}
