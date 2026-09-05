export async function readApiJson(response, fallbackMessage = "Could not complete the request.") {
  const statusSuffix = response?.status ? ` (HTTP ${response.status})` : "";
  let raw = "";

  try {
    raw = await response.text();
  } catch {
    throw new Error(`${fallbackMessage}${statusSuffix}`);
  }

  if (!raw) throw new Error(`${fallbackMessage}${statusSuffix}`);

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    // Reverse proxies and gateways sometimes return an HTML error page. Do not
    // expose a JSON parser exception (or the proxy response body) to the user.
    throw new Error(`${fallbackMessage}${statusSuffix}`);
  }

  if (!response.ok) {
    const apiMessage = data && typeof data === "object" && !Array.isArray(data)
      ? String(data.error || "").trim()
      : "";
    throw new Error(apiMessage || `${fallbackMessage}${statusSuffix}`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${fallbackMessage}${statusSuffix}`);
  }
  return data;
}
