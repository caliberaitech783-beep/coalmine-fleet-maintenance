export function tableLayoutStorageKey(account, table, columns = []) {
  const owner = String(account || "").trim().toLowerCase();
  if (!owner) throw new Error("Sign in to save table layouts.");
  return `bdms:table-layouts:v1:${JSON.stringify([owner, table || "table", columns.map(column => column.key).sort()])}`;
}

export function tableLayoutAccount() {
  const session = JSON.parse(localStorage.getItem("nerveCenterSession") || sessionStorage.getItem("nerveCenterSession") || "null");
  return session?.login || session?.name || "";
}

export function layoutColumnKeys(keys, columns) {
  const known = new Set(columns.map(column => column.key));
  return [...new Set(Array.isArray(keys) ? keys : [])].filter(key => known.has(key));
}

export function readTableLayouts(storage, key, columns) {
  const value = JSON.parse(storage.getItem(key) || "[]");
  if (!Array.isArray(value)) throw new Error("Saved table layouts could not be read.");
  const ids = new Set();
  return value.flatMap(layout => {
    if (!layout || !Number.isSafeInteger(layout.id) || layout.id < 1 || ids.has(layout.id) || typeof layout.name !== "string" || !layout.name.trim()) return [];
    const keys = layoutColumnKeys(layout.keys, columns);
    if (!keys.length) return [];
    ids.add(layout.id);
    return [{ id: layout.id, name: layout.name, keys }];
  });
}

export function matchingTableLayout(layouts, keys) {
  return layouts.find(layout => layout.keys.length === keys.length && layout.keys.every((key, index) => key === keys[index]));
}

// Re-read before each write so another open table/tab's saved layouts are retained.
// Persist before reporting success; quota/private-mode failures leave the UI unchanged.
export function changeTableLayout(storage, key, columns, { type, id, name, keys }) {
  const layouts = readTableLayouts(storage, key, columns);
  const selected = layouts.find(layout => layout.id === id);
  if (type !== "save" && !selected) throw new Error("This layout no longer exists. Select another layout.");
  let cleanName;
  if (type === "save" || type === "rename") {
    cleanName = String(name || "").replace(/\s+/g, " ").trim();
    if (!cleanName) throw new Error("Enter a layout name.");
    if (cleanName.length > 80) throw new Error("Layout name must be 80 characters or fewer.");
    if (layouts.some(layout => (type === "save" || layout.id !== id) && layout.name.toLowerCase() === cleanName.toLowerCase())) throw new Error("A table layout with this name already exists.");
  }
  const visible = layoutColumnKeys(keys, columns);
  if ((type === "save" || type === "update") && !visible.length) throw new Error("Select at least one column.");
  let next, selectedId = id;
  if (type === "save") {
    selectedId = Math.max(0, ...layouts.map(layout => layout.id)) + 1;
    next = [...layouts, { id: selectedId, name: cleanName, keys: visible }];
  } else if (type === "rename") next = layouts.map(layout => layout.id === id ? { ...layout, name: cleanName } : layout);
  else if (type === "update") next = layouts.map(layout => layout.id === id ? { ...layout, keys: visible } : layout);
  else if (type === "delete") next = layouts.filter(layout => layout.id !== id);
  else throw new Error("Unknown table layout action.");
  storage.setItem(key, JSON.stringify(next));
  return { layouts: next, selectedId: type === "delete" ? "" : selectedId };
}
