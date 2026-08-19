export function activeOpenCases(requests = []) {
  return requests.filter((request) => String(request?.status || "").trim().toLowerCase() !== "closed");
}

export function openCasesBySite(requests = []) {
  const sites = new Map();
  for (const request of activeOpenCases(requests)) {
    const label = String(request?.site || "").trim() || "Not assigned";
    const key = label.toLocaleLowerCase().replace(/\s+/g, " ");
    const group = sites.get(key) || { key, label, requests: [] };
    group.requests.push(request);
    sites.set(key, group);
  }
  return [...sites.values()].sort((left, right) =>
    right.requests.length - left.requests.length || left.label.localeCompare(right.label),
  );
}
