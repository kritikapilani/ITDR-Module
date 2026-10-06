/** PRD §12 & ITDR merged field catalogues and master libraries. */

export const APPLICATION_TYPES = Object.freeze(["custom_built", "cots", "saas", "legacy"]);
export const HOSTING_ENVIRONMENTS = Object.freeze(["on_prem", "aws", "azure", "gcp", "hybrid", "vendor_hosted"]);
export const HOSTING_ROLES = Object.freeze(["primary", "secondary", "none"]);
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

export const DEFAULT_ENVIRONMENTS = Object.freeze([
  { id: "env-prod", name: "Production", active: true },
  { id: "env-dr", name: "DR", active: true },
  { id: "env-uat", name: "UAT", active: true },
  { id: "env-dev", name: "Dev", active: true },
]);

export const DEFAULT_SITES = Object.freeze([
  { id: "site-mum-dc01", name: "Mumbai-DC-01", location: "Mumbai, India", active: true },
  { id: "site-chn-dc02", name: "Chennai-DC-02", location: "Chennai, India", active: true },
  { id: "site-blr-dc03", name: "Bangalore-DC-03", location: "Bangalore, India", active: true },
  { id: "site-aws-aps1", name: "AWS ap-south-1 (Mumbai)", location: "AWS Cloud", active: true },
  { id: "site-aws-aps2", name: "AWS ap-south-2 (Hyderabad)", location: "AWS Cloud", active: true },
  { id: "site-az-cin1", name: "Azure Central India (Pune)", location: "Azure Cloud", active: true },
  { id: "site-gcp-as1", name: "GCP asia-south1 (Mumbai)", location: "Google Cloud", active: true },
]);

export const DEFAULT_APPLICATION_LIBRARY = Object.freeze([
  {
    id: "bia-app-payments",
    name: "Payments Gateway",
    type: "custom_built",
    defaultOwnerUserId: "user-plan_owner",
    defaultTier: 1,
    active: true,
  },
  {
    id: "bia-app-hr",
    name: "HR Portal",
    type: "cots",
    defaultOwnerUserId: "user-plan_owner",
    defaultTier: 2,
    active: true,
  },
  {
    id: "bia-app-wiki",
    name: "Internal Wiki",
    type: "legacy",
    defaultOwnerUserId: "user-admin",
    defaultTier: 3,
    active: true,
  },
  {
    id: "app-core-banking",
    name: "Core Banking Engine",
    type: "custom_built",
    defaultOwnerUserId: "user-plan_owner",
    defaultTier: 1,
    active: true,
  },
  {
    id: "app-customer-crm",
    name: "Customer CRM",
    type: "saas",
    defaultOwnerUserId: "user-plan_owner",
    defaultTier: 2,
    active: true,
  },
  {
    id: "app-identity-sso",
    name: "Enterprise SSO & IAM",
    type: "custom_built",
    defaultOwnerUserId: "user-admin",
    defaultTier: 1,
    active: true,
  },
  {
    id: "app-analytics-bi",
    name: "Analytics & BI Platform",
    type: "cots",
    defaultOwnerUserId: "user-plan_owner",
    defaultTier: 3,
    active: true,
  },
]);

export const DEFAULT_SCENARIOS = Object.freeze([
  { id: "site_outage", name: "Primary Site Outage / Data Center Failure" },
  { id: "db_corruption", name: "Database Corruption / Data Loss" },
  { id: "ransomware", name: "Ransomware / Cyber Attack" },
  { id: "cloud_region_failure", name: "Regional Cloud Provider Outage" },
]);

export function fieldCatalogs() {
  return {
    applicationTypes: APPLICATION_TYPES,
    hostingEnvironments: HOSTING_ENVIRONMENTS,
    hostingRoles: HOSTING_ROLES,
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
    applicationLibrary: DEFAULT_APPLICATION_LIBRARY,
    siteLibrary: DEFAULT_SITES,
    environmentLibrary: DEFAULT_ENVIRONMENTS,
    scenarios: DEFAULT_SCENARIOS,
  };
}
