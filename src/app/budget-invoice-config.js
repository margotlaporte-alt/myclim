import { platformRoleOptions } from "./seed-data";
import { normalizeRole } from "./utils";

const ALLOWED_ROLE_VALUES = new Set(platformRoleOptions.map((role) => role.value));

function normalizeBudgetInvoiceConfigurationPayload(data = {}) {
  const allowedUploaderRoles = Array.isArray(data?.allowedUploaderRoles)
    ? [...new Set(
        data.allowedUploaderRoles
          .map((role) => normalizeRole(role))
          .filter((role) => ALLOWED_ROLE_VALUES.has(role)),
      )]
    : [];

  const allowedUploaderUserIds = Array.isArray(data?.allowedUploaderUserIds)
    ? [...new Set(
        data.allowedUploaderUserIds
          .map((userId) => String(userId || "").trim())
          .filter(Boolean),
      )]
    : [];

  return {
    allowedUploaderRoles,
    allowedUploaderUserIds,
  };
}

function canUserUploadBudgetInvoice({ activeRoles = [], userId = "", configuration = {} }) {
  const normalizedRoles = Array.isArray(activeRoles)
    ? [...new Set(activeRoles.map((role) => normalizeRole(role)).filter(Boolean))]
    : [];
  const normalizedUserId = String(userId || "").trim();
  const normalizedConfiguration = normalizeBudgetInvoiceConfigurationPayload(configuration);

  if (normalizedRoles.includes("admin")) return true;
  if (normalizedUserId && normalizedConfiguration.allowedUploaderUserIds.includes(normalizedUserId)) return true;

  return normalizedRoles.some((role) => normalizedConfiguration.allowedUploaderRoles.includes(role));
}

export {
  canUserUploadBudgetInvoice,
  normalizeBudgetInvoiceConfigurationPayload,
};
