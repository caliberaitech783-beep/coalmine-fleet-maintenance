export function auditDeviceDetails(userAgent = "") {
  const agent = String(userAgent);
  if (!agent) return { type: "Unknown", platform: "Unknown", browser: "Unknown" };
  const platform = /Android/i.test(agent)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(agent)
      ? "iOS"
      : /Windows/i.test(agent)
        ? "Windows"
        : /Macintosh|Mac OS X/i.test(agent)
          ? "macOS"
          : /Linux/i.test(agent)
            ? "Linux"
            : "Unknown";
  const type = /Android|iPhone|iPad|iPod|Mobile/i.test(agent) ? "Mobile" : "Computer";
  const browser = /Edg\//i.test(agent)
    ? "Edge"
    : /OPR\//i.test(agent)
      ? "Opera"
      : /Firefox\/|FxiOS\//i.test(agent)
        ? "Firefox"
        : /Chrome\/|CriOS\//i.test(agent)
          ? "Chrome"
          : /Safari\//i.test(agent)
            ? "Safari"
            : "Browser";
  return { type, platform, browser };
}
