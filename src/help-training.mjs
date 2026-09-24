const guideDefinitions = {
  "production user": {
    role: "Production User",
    title: "Production Help & Training",
    english: "/user-guides/production-user-guide-english.mp4",
    hindi: "/user-guides/production-user-guide-hindi.mp4",
    topics: [
      "First login and password setup",
      "Dashboard and production workspace",
      "Raise a breakdown request",
      "Track a request to closure",
      "Ask for a correction",
      "Idle vehicles and closed history",
      "Notifications, search and filters",
      "Reports, Smart Print and night mode",
    ],
  },
  "maintenance user": {
    role: "Maintenance User",
    title: "Maintenance Help & Training",
    english: "/user-guides/maintenance-user-guide-english.mp4",
    hindi: "/user-guides/maintenance-user-guide-hindi.mp4",
    topics: [
      "First login and maintenance workspace",
      "Accept a vehicle and flag arrival",
      "Diagnosis and expected time to complete",
      "Daily updates and delay reasons",
      "Breakdown type and complaint",
      "Close a request and hand over to MIS",
      "Idle vehicles, Make on road and history",
      "Notifications, reports and Smart Print",
    ],
  },
  "mis user": {
    role: "MIS User",
    title: "MIS Help & Training",
    english: "/user-guides/mis-user-guide-english.mp4",
    hindi: "/user-guides/mis-user-guide-hindi.mp4",
    topics: [
      "First login and MIS workspace",
      "What MIS verification means",
      "Check the closed request facts",
      "First trip and trip card upload",
      "Verify and lock a request",
      "Raise a red flag on wrong data",
      "Vehicle transfers, history and timeline",
      "Notifications, reports and night mode",
    ],
  },
  "production manager": {
    role: "Production Manager",
    title: "Production Manager Help & Training",
    english: "/user-guides/production-manager-guide-english.mp4",
    hindi: "/user-guides/production-manager-guide-hindi.mp4",
    topics: ["Manager dashboard", "Production requests and approvals", "Idle vehicle decisions", "Site reports and monitoring"],
  },
  "maintenance manager": {
    role: "Maintenance Manager",
    title: "Maintenance Manager Help & Training",
    english: "/user-guides/maintenance-manager-guide-english.mp4",
    hindi: "/user-guides/maintenance-manager-guide-hindi.mp4",
    topics: ["Manager dashboard", "Request allocation and progress", "Delayed reasons and closures", "Maintenance reports"],
  },
  "mis manager": {
    role: "MIS Manager",
    title: "MIS Manager Help & Training",
    english: "/user-guides/mis-manager-guide-english.mp4",
    hindi: "/user-guides/mis-manager-guide-hindi.mp4",
    topics: ["Manager dashboard", "MIS verification", "On-road and idle vehicle review", "MIS reports and history"],
  },
};

export function userGuideForRole(role = "") {
  const normalized = String(role).trim().toLowerCase();
  return guideDefinitions[normalized] || null;
}

export function userGuidesForRoles(roles = []) {
  const values = Array.isArray(roles) ? roles : [roles];
  const seen = new Set();
  return values.map(userGuideForRole).filter((guide) => {
    if (!guide || seen.has(guide.role)) return false;
    seen.add(guide.role);
    return true;
  });
}

export function userGuideVideo(guide, language = "en") {
  if (!guide) return "";
  return language === "hi" ? guide.hindi : guide.english;
}

export function userGuideStorageKey(role = "") {
  return `nerve-center:user-guide-seen:${String(role).trim().toLowerCase().replaceAll(" ", "-")}`;
}

