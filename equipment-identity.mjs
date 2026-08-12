const normalize = (value) => String(value ?? "").trim().toLowerCase();

export function equipmentIdentity(record = {}) {
  const identifiers = [
    ["manufacturerSerialNo", "serial"],
    ["asset", "asset"],
    ["reg", "registration"],
    ["door", "door"],
    ["engineNo", "engine"],
    ["chassisNo", "chassis"],
  ];
  for (const [field, prefix] of identifiers) {
    const value = normalize(record[field]);
    if (value) return `${prefix}:${value}`;
  }
  const descriptiveIdentity = [
    record.currentLocation || record.location,
    record.equipmentName,
    record.category,
    record.itemSpecification,
    record.make,
    record.model,
  ].map(normalize);
  return descriptiveIdentity.some(Boolean)
    ? `description:${descriptiveIdentity.join("|")}`
    : "";
}
