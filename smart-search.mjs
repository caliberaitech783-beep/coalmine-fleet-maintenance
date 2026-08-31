function searchableParts(value) {
  if (Array.isArray(value)) return value.flatMap(searchableParts);
  if (value && typeof value === "object") return Object.values(value).flatMap(searchableParts);
  return [String(value ?? "")];
}

export function normalizeSearchText(value) {
  return searchableParts(value)
    .join(" ")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchesSmartSearch(query, ...values) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const haystack = normalizeSearchText(values);
  const compactHaystack = haystack.replaceAll(" ", "");
  return normalizedQuery.split(" ").every((token) =>
    haystack.includes(token) || compactHaystack.includes(token),
  );
}
