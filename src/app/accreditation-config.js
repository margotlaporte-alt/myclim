import { defaultTeamRoles } from "./team-config";

const accreditationZoneSeed = [
  { id: "zone-infield", order: 1, name: "Infield" },
  { id: "zone-warmup", order: 2, name: "Warm-up" },
  { id: "zone-coaching", order: 3, name: "Coaching Zone" },
  { id: "zone-judges", order: 4, name: "Judges Room" },
  { id: "zone-mixed", order: 5, name: "Mixed Zone" },
  { id: "zone-vip", order: 6, name: "VIP Zone" },
];

const roleAccreditationSeed = {
  Transport: ["zone-mixed", "zone-vip"],
  "Warm-up": ["zone-infield", "zone-warmup", "zone-coaching"],
  "Call room": ["zone-judges", "zone-mixed"],
};

const volunteerAccreditationOverrideSeed = {
  "vol-002": {
    addZoneIds: ["zone-vip"],
    removeZoneIds: [],
    printStatus: "Non-imprimé",
  },
  "vol-003": {
    addZoneIds: ["zone-infield"],
    removeZoneIds: ["zone-mixed"],
    printStatus: "Imprimé",
  },
  "vol-005": {
    addZoneIds: [],
    removeZoneIds: ["zone-vip"],
    printStatus: "Imprimé",
  },
};
const ACCREDITATION_PRINT_STATUS_OPTIONS = [
  "Non-imprimé",
  "Dans la file",
  "Imprimé",
  "Annulé",
  "Imprimé à détruire",
];
const BADGE_STORAGE_LOCATIONS = [];
const NON_NOMINATIVE_BADGE_TEMPLATES = [
  {
    id: "athlete",
    label: "Athlete",
    badgeLabel: "Athlete",
    defaultZoneIds: ["zone-infield", "zone-warmup", "zone-mixed", "zone-vip"],
  },
  {
    id: "coach",
    label: "Coach",
    badgeLabel: "Coach",
    defaultZoneIds: ["zone-warmup", "zone-coaching"],
  },
];

function normalizeSubRoles(subRoles) {
  if (!Array.isArray(subRoles)) return [];
  const seen = new Set();
  return subRoles
    .map((subRole) => String(subRole || "").trim())
    .filter((subRole) => {
      if (!subRole) return false;
      const normalizedSubRole = subRole.toLowerCase();
      if (seen.has(normalizedSubRole)) return false;
      seen.add(normalizedSubRole);
      return true;
    });
}

function normalizeAccreditationZone(zone, index = 0) {
  const fallbackZone = accreditationZoneSeed[index] ?? accreditationZoneSeed[0] ?? {};
  const normalizedOrder = Number(zone?.order);

  return {
    id: String(zone?.id || fallbackZone.id || `zone-${index + 1}`),
    order: Number.isFinite(normalizedOrder) && normalizedOrder > 0 ? normalizedOrder : index + 1,
    name: String(zone?.name || fallbackZone.name || `Zone ${index + 1}`),
  };
}

function normalizeAccreditationOverride(override = {}, availableZoneIds = new Set()) {
  const normalizedPrintStatus = ACCREDITATION_PRINT_STATUS_OPTIONS.includes(String(override?.printStatus || "").trim())
    ? String(override.printStatus).trim()
    : override?.badgeStatus === "Imprimé" || override?.badgeStatus === "Remis"
      ? "Imprimé"
      : "Non-imprimé";

  return {
    addZoneIds: normalizeSubRoles(Array.isArray(override?.addZoneIds) ? override.addZoneIds : []).filter((zoneId) =>
      availableZoneIds.has(zoneId),
    ),
    removeZoneIds: normalizeSubRoles(Array.isArray(override?.removeZoneIds) ? override.removeZoneIds : []).filter(
      (zoneId) => availableZoneIds.has(zoneId),
    ),
    printStatus: normalizedPrintStatus,
    badgeLabel: String(override?.badgeLabel || "").trim(),
    warningMessage: String(override?.warningMessage || "").trim(),
    lastQueuedAt: override?.lastQueuedAt || null,
    lastPrintedAt: override?.lastPrintedAt || null,
    destroyedAt: override?.destroyedAt || null,
    printedSnapshot: {
      roleLabel: String(override?.printedSnapshot?.roleLabel || "").trim(),
      roleNames: normalizeSubRoles(Array.isArray(override?.printedSnapshot?.roleNames) ? override.printedSnapshot.roleNames : []),
      zoneIds: normalizeSubRoles(Array.isArray(override?.printedSnapshot?.zoneIds) ? override.printedSnapshot.zoneIds : []).filter(
        (zoneId) => availableZoneIds.has(zoneId),
      ),
    },
  };
}

function normalizePrintHistoryItem(entry = {}, index = 0) {
  return {
    id: String(entry?.id || `print-history-item-${index + 1}`),
    volunteerId: String(entry?.volunteerId || "").trim(),
    name: String(entry?.name || "").trim(),
    roleLabel: String(entry?.roleLabel || "").trim(),
    roleNames: normalizeSubRoles(Array.isArray(entry?.roleNames) ? entry.roleNames : []),
    zoneLabels: normalizeSubRoles(Array.isArray(entry?.zoneLabels) ? entry.zoneLabels : []),
    printedAt: entry?.printedAt || null,
    generatedBy: String(entry?.generatedBy || "").trim(),
    reviewStatus: String(entry?.reviewStatus || "").trim(),
    reviewComment: String(entry?.reviewComment || "").trim(),
  };
}

function normalizePrintHistoryBatch(batch = {}, index = 0) {
  const items = Array.isArray(batch?.items)
    ? batch.items.map((item, itemIndex) => normalizePrintHistoryItem(item, itemIndex))
    : [];
  const firstItem = items[0] || null;

  return {
    id: String(batch?.id || `print-batch-${index + 1}`),
    printedAt: batch?.printedAt || firstItem?.printedAt || null,
    generatedBy: String(batch?.generatedBy || firstItem?.generatedBy || "").trim(),
    items,
  };
}

function normalizeAccreditationConfigurationPayload(data, roles = defaultTeamRoles) {
  const zonesSource = Array.isArray(data?.zones) && data.zones.length > 0 ? data.zones : accreditationZoneSeed;
  const zones = zonesSource.map((zone, index) => normalizeAccreditationZone(zone, index));
  const availableZoneIds = new Set(zones.map((zone) => zone.id));
  const storedRoleZoneAssignments =
    data?.roleZoneAssignments && typeof data.roleZoneAssignments === "object" ? data.roleZoneAssignments : {};
  const storedVolunteerOverrides =
    data?.volunteerOverrides && typeof data.volunteerOverrides === "object" ? data.volunteerOverrides : {};

  const roleZoneAssignments = roles.reduce((accumulator, role) => {
    const storedZoneIds = storedRoleZoneAssignments[role.id];
    const fallbackZoneIds = roleAccreditationSeed[role.roleName] ?? [];

    accumulator[role.id] = normalizeSubRoles(Array.isArray(storedZoneIds) ? storedZoneIds : fallbackZoneIds).filter(
      (zoneId) => availableZoneIds.has(zoneId),
    );
    return accumulator;
  }, {});

  const volunteerOverrideSource = Object.keys(storedVolunteerOverrides).length
    ? storedVolunteerOverrides
    : volunteerAccreditationOverrideSeed;

  const volunteerOverrides = Object.fromEntries(
    Object.entries(volunteerOverrideSource).map(([volunteerId, override]) => [
      String(volunteerId || "").trim(),
      normalizeAccreditationOverride(override, availableZoneIds),
    ]),
  );
  const printHistory = Array.isArray(data?.printHistory)
    ? (
      data.printHistory.length > 0 && Array.isArray(data.printHistory[0]?.items)
        ? data.printHistory.map((batch, index) => normalizePrintHistoryBatch(batch, index))
        : Object.values(
            data.printHistory.reduce((accumulator, entry, index) => {
              const normalizedEntry = normalizePrintHistoryItem(entry, index);
              const groupingKey = `${normalizedEntry.printedAt || "unknown"}::${normalizedEntry.generatedBy || "unknown"}`;

              if (!accumulator[groupingKey]) {
                accumulator[groupingKey] = {
                  id: `legacy-batch-${index + 1}`,
                  printedAt: normalizedEntry.printedAt,
                  generatedBy: normalizedEntry.generatedBy,
                  items: [],
                };
              }

              accumulator[groupingKey].items.push(normalizedEntry);
              return accumulator;
            }, {}),
          ).map((batch, index) => normalizePrintHistoryBatch(batch, index))
    )
    : [];

  const badgeStorageLocations =
    data?.badgeStorageLocations && typeof data.badgeStorageLocations === "object"
      ? Object.fromEntries(
          Object.entries(data.badgeStorageLocations).map(([k, v]) => [k, String(v || "").trim()]),
        )
      : {};

  const customStorageLocations = Array.isArray(data?.customStorageLocations)
    ? data.customStorageLocations.map((v) => String(v || "").trim()).filter(Boolean)
    : [];

  return {
    zones,
    roleZoneAssignments,
    volunteerOverrides,
    printHistory,
    badgeStorageLocations,
    customStorageLocations,
  };
}

export {
  ACCREDITATION_PRINT_STATUS_OPTIONS,
  BADGE_STORAGE_LOCATIONS,
  NON_NOMINATIVE_BADGE_TEMPLATES,
  normalizeAccreditationConfigurationPayload,
  normalizeAccreditationOverride,
};
