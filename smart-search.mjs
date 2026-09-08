function searchableParts(value) {
  if (Array.isArray(value)) return value.flatMap(searchableParts);
  if (value && typeof value === "object") return Object.values(value).flatMap(searchableParts);
  return [String(value ?? "")];
}

export function normalizeSearchText(value) {
  return searchableParts(value)
    .join(" ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
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
