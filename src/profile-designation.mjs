const DIRECTOR_PROFILE_NAMES = new Set([
  "mohit chadda",
  "manish chadda",
  "rahul chadda",
]);

const normalizedName = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

export function profileHeaderDesignation({ name = "", permissions = {} } = {}) {
  if (DIRECTOR_PROFILE_NAMES.has(normalizedName(name))) return "Director";
  if (permissions.adminLevel === "Manager") {
    return permissions.managerRoles?.join(" · ") || permissions.managerRole || "Manager";
  }
  if (permissions.adminLevel === "Super Admin") return "Super Admin";
  return "Admin";
}
