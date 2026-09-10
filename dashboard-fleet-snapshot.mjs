import { createFleetAssetResolver } from "./dashboard-equipment-metrics.mjs";
import { requestsVisibleGlobally } from "./mis-request-visibility.mjs";

const normalize = (value) => String(value ?? "").trim().toLowerCase();
const identityWarning = "Active request identity needs review; current fleet status cannot be confirmed.";

// Compute against the complete server-side registry/request collection before
// applying role/site visibility. Only ephemeral status metadata is returned;
// hidden request references, locations, people and remarks are never attached.
export function dashboardFleetSnapshot(allEquipment = [], allRequests = []) {
  const resolve = createFleetAssetResolver(allEquipment);
  const definite = allEquipment.map(() => "onroad");
  const uncertain = new Set();
  for (const request of requestsVisibleGlobally(allRequests)) {
    const status = normalize(request.status);
    if (status === "closed") continue;
    const resolution = resolve(request, { allowTransferred: true });
    if (resolution.assetIndex === null) {
      resolution.candidateIndexes.forEach((index) => uncertain.add(index));
      continue;
    }
    const index = resolution.assetIndex;
    const roadStatus = ["idle", "ideal"].includes(status) ? "idle" : "offroad";
    if (definite[index] !== "offroad") definite[index] = roadStatus;
  }
  return allEquipment.map((record, index) => {
    const snapshot = { ...record, dashboardRoadStatus: definite[index] };
    // Never carry a previous calculation's warning into a fresh snapshot.
    delete snapshot.dashboardStatusWarning;
    if (uncertain.has(index)) {
      if (definite[index] !== "offroad") snapshot.dashboardRoadStatus = "unknown";
      snapshot.dashboardStatusWarning = identityWarning;
    }
    return snapshot;
  });
}
