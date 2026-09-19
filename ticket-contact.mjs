// Phone contact for the person who raised a ticket, read from their Users &
// employees record (the same "Phone no." used for the WhatsApp password OTP).

const text = (value) => String(value ?? "").trim();

/** Phone number as stored on a user record (phone / phoneNo / phoneNumber). */
export function userRecordPhone(record = {}) {
  return text(record?.phone || record?.phoneNo || record?.phoneNumber);
}

/** Dialable tel: link, or "" when the number is unusable. Ten-digit Indian numbers get +91. */
export function telHref(phone) {
  const raw = text(phone);
  if (!raw) return "";
  const plus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!plus && digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!plus && digits.length === 12 && digits.startsWith("91")) return `tel:+${digits}`;
  if (!plus && digits.length === 10) return `tel:+91${digits}`;
  if (plus && digits.length >= 8 && digits.length <= 15) return `tel:+${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `tel:${digits}`;
  return "";
}

/** Map of lower-case login -> phone for the given user records. */
export function phonesByLogin(records = []) {
  const map = new Map();
  for (const record of records) {
    const login = text(record?.login).toLowerCase();
    const phone = userRecordPhone(record);
    if (login && phone && !map.has(login)) map.set(login, phone);
  }
  return map;
}

/** Adds creatorPhone / creatorPhoneHref to tickets whose raiser has a phone on record. */
export function withCreatorContact(tickets = [], phones = new Map()) {
  return tickets.map((ticket) => {
    const phone = phones.get(text(ticket?.creatorLogin).toLowerCase()) || "";
    const href = telHref(phone);
    return href ? { ...ticket, creatorPhone: phone, creatorPhoneHref: href } : ticket;
  });
}
