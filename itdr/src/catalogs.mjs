/** PRD §12 field catalogues used by APIs and screens. */

export const APPLICATION_TYPES = Object.freeze(["custom_built", "cots", "saas", "legacy"]);
export const HOSTING_ENVIRONMENTS = Object.freeze(["on_prem", "aws", "azure", "gcp", "hybrid", "vendor_hosted"]);
export const LIFECYCLE_STATUSES = Object.freeze(["active", "under_review", "decommissioned"]);
export const BACKUP_FREQUENCIES = Object.freeze(["real_time", "hourly", "daily", "weekly"]);
export const RETENTION_UNITS = Object.freeze(["hours", "days", "weeks", "months"]);
export const FAILOVER_METHODS = Object.freeze(["manual", "automated", "semi_automated"]);
export const CONTACT_TYPES = Object.freeze(["primary", "backup", "escalation", "vendor"]);
export const TEST_OUTCOMES = Object.freeze(["pass", "fail", "partial"]);
export const STEP_RESULTS = Object.freeze(["pass", "fail", "na"]);
export const ATTACH_KINDS = Object.freeze(["diagram", "config_backup", "vendor_sla"]);
export const ASSET_TYPES = Object.freeze(["application", "infrastructure", "datastore", "network", "identity", "third_party"]);
export const ENVIRONMENTS = Object.freeze(["prod", "dr", "nonprod"]);
export const CRITICALITY = Object.freeze(["high", "medium", "low"]);
export const DEP_TYPES = Object.freeze(["depends_on", "replicates", "hosted_on"]);

export function fieldCatalogs() {
  return {
    applicationTypes: APPLICATION_TYPES,
    hostingEnvironments: HOSTING_ENVIRONMENTS,
    lifecycleStatuses: LIFECYCLE_STATUSES,
    backupFrequencies: BACKUP_FREQUENCIES,
    retentionUnits: RETENTION_UNITS,
    failoverMethods: FAILOVER_METHODS,
    contactTypes: CONTACT_TYPES,
    testOutcomes: TEST_OUTCOMES,
    stepResults: STEP_RESULTS,
    attachKinds: ATTACH_KINDS,
    assetTypes: ASSET_TYPES,
    environments: ENVIRONMENTS,
    criticality: CRITICALITY,
    dependencyTypes: DEP_TYPES,
  };
}
