const guideDefinitions = {
  production: {
    role: "Production User",
    title: "Production Help & Training",
    english: "/user-guides/production-user-guide-english.mp4",
    hindi: "/user-guides/production-user-guide-hindi.mp4",
    topics: ["Sign in and password setup", "Production dashboard", "Create and track requests", "Idle vehicles and reports"],
  },
  maintenance: {
    role: "Maintenance User",
    title: "Maintenance Help & Training",
    english: "/user-guides/maintenance-user-guide-english.mp4",
    hindi: "/user-guides/maintenance-user-guide-hindi.mp4",
    topics: ["Maintenance dashboard", "Accept and update requests", "Close requests", "History and reports"],
  },
  mis: {
    role: "MIS User",
    title: "MIS Help & Training",
    english: "/user-guides/mis-user-guide-english.mp4",
    hindi: "/user-guides/mis-user-guide-hindi.mp4",
    topics: ["MIS dashboard", "Verify closed requests", "Record trip details", "History and reports"],
  },
};

export function userGuideForRole(role = "") {
  const normalized = String(role).trim().toLowerCase();
  if (normalized === "production user") return guideDefinitions.production;
  if (normalized === "maintenance user") return guideDefinitions.maintenance;
  if (normalized === "mis user") return guideDefinitions.mis;
  return null;
}

export function userGuideVideo(guide, language = "en") {
  if (!guide) return "";
  return language === "hi" ? guide.hindi : guide.english;
}

export function userGuideStorageKey(role = "") {
  return `nerve-center:user-guide-seen:${String(role).trim().toLowerCase().replaceAll(" ", "-")}`;
}

