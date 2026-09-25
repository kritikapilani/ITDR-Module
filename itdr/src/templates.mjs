export const STRATEGIES = Object.freeze(["hot_site", "warm_site", "cold_site", "cloud_dr", "backup_restore"]);

const COMMON_CONTACTS = [
  { role: "recovery_lead", name: "", email: "", phone: "", contactType: "primary", escalationOrder: 1 },
  { role: "escalation", name: "", email: "", phone: "", contactType: "escalation", escalationOrder: 2 },
];

export function templateForTier(tier) {
  const t = Number(tier);
  if (t === 1) {
    return {
      id: "tpl-tier-1",
      name: "Tier 1 — hot site / failover",
      strategy: "hot_site",
      steps: [
        { order: 1, title: "Declare recovery", instruction: "Declare IT recovery for this application and open the bridge.", ownerRole: "Incident Commander", prerequisite: "Incident already declared in Crisis Management.", estimatedDurationMinutes: 15, rollback: "N/A", verification: "Bridge open and roster confirmed." },
        { order: 2, title: "Fail over identity", instruction: "Fail over identity and network dependencies at the DR site.", ownerRole: "Network Lead", prerequisite: "DR identity path healthy.", estimatedDurationMinutes: 30, rollback: "Fail back identity to production.", verification: "Auth path healthy at DR." },
        { order: 3, title: "Fail over data", instruction: "Fail over data stores and verify RPO against the BIA objective.", ownerRole: "DB Admin", prerequisite: "Replication lag known.", estimatedDurationMinutes: 45, rollback: "Restore production as primary.", verification: "RPO measured and logged." },
        { order: 4, title: "Fail over application", instruction: "Fail over the application cluster and run health checks.", ownerRole: "App Owner", prerequisite: "Data store accepting connections.", estimatedDurationMinutes: 30, rollback: "Disable DR cluster and restore prod traffic.", verification: "Health checks green." },
      ],
      contacts: cloneContacts(),
    };
  }
  if (t === 2) {
    return {
      id: "tpl-tier-2",
      name: "Tier 2 — warm site",
      strategy: "warm_site",
      steps: [
        { order: 1, title: "Provision warm site", instruction: "Provision warm-site compute from the agreed image.", ownerRole: "Infra Lead", prerequisite: "Capacity reserved.", estimatedDurationMinutes: 60, rollback: "Deprovision warm-site nodes.", verification: "Nodes online." },
        { order: 2, title: "Restore data", instruction: "Restore data to the warm site and check integrity.", ownerRole: "DB Admin", prerequisite: "Latest approved backup catalogued.", estimatedDurationMinutes: 90, rollback: "Discard incomplete restore.", verification: "Integrity check passed." },
        { order: 3, title: "Start services", instruction: "Start application services in dependency order.", ownerRole: "App Owner", prerequisite: "Identity reachable.", estimatedDurationMinutes: 40, rollback: "Stop services in reverse order.", verification: "App login succeeds." },
      ],
      contacts: cloneContacts(),
    };
  }
  return {
    id: "tpl-tier-3",
    name: Number.isFinite(t) && t === 3 ? "Tier 3 — backup and restore" : "Default — backup and restore",
    strategy: "backup_restore",
    steps: [
      { order: 1, title: "Locate backup", instruction: "Locate the latest backup set and restore credentials reference (not the secret).", ownerRole: "Backup Admin", prerequisite: "Backup job id recorded.", estimatedDurationMinutes: 20, rollback: "N/A", verification: "Catalog entry confirmed." },
      { order: 2, title: "Rebuild application", instruction: "Restore data and rebuild the application on recovery hardware or cloud.", ownerRole: "App Owner", prerequisite: "Build spec attached.", estimatedDurationMinutes: 180, rollback: "Tear down the rebuild.", verification: "Smoke test passed." },
    ],
    contacts: cloneContacts(),
  };
}

function cloneContacts() {
  return COMMON_CONTACTS.map((c) => ({ ...c }));
}

export function listTemplates() {
  return [templateForTier(1), templateForTier(2), templateForTier(3)];
}
