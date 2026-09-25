/** Sprint 0 decisions D1–D7. Source of truth for the running shell and tests. */

export const RECORDED_AT = "2026-09-21";
export const OWNER = "ITDR Sprint 0";

export const DecisionStatus = {
  DEFAULTED: "DEFAULTED_PENDING_CONFIRMATION",
  LOCKED: "LOCKED",
};

export const decisions = Object.freeze({
  D1: {
    id: "D1",
    title: "Authoritative IT asset inventory",
    value: "native_plus_cmdb_adapter",
    summary:
      "Native ITDR inventory plus a CMDB adapter interface. Real sync is Phase 3 if the source is unclear.",
    neededFor: ["FR-1"],
    confirmWith: "CMDB/ITSM + BCM Admin",
    status: DecisionStatus.DEFAULTED,
  },
  D2: {
    id: "D2",
    title: "BIA application identity and RTO/RPO roll-up",
    value: {
      identityField: "biaApplicationId",
      grain: "one_target_per_bia_application",
      rtoRpoRollup: "most_demanding_min_non_null",
    },
    summary:
      "Stable key is biaApplicationId. One recovery target per BIA application. Roll-up uses the lowest non-null RTO and RPO among linked processes.",
    neededFor: ["FR-2", "FR-3"],
    confirmWith: "BIA team",
    status: DecisionStatus.DEFAULTED,
  },
  D3: {
    id: "D3",
    title: "Testing DR Test type and planVersionId binding",
    value: {
      testType: "DR_TEST",
      bindField: "planVersionId",
      implementationPhase: 2,
    },
    summary:
      "Contract drafted now. Implementation in Phase 2. Unbound results do not count toward readiness.",
    neededFor: ["FR-14", "FR-15", "FR-16", "FR-17"],
    confirmWith: "Testing team",
    status: DecisionStatus.DEFAULTED,
  },
  D4: {
    id: "D4",
    title: "Recertification window by tier",
    value: {
      unit: "months",
      byTier: { 1: 12, 2: 12, 3: 12 },
    },
    summary: "Configurable policy; seed 12 months for all tiers until BCM policy is confirmed.",
    neededFor: ["FR-15", "FR-19", "FR-20"],
    confirmWith: "BCM policy / InfoSec",
    status: DecisionStatus.DEFAULTED,
  },
  D5: {
    id: "D5",
    title: "Approval authority",
    value: {
      style: "single_approver",
      segregationOfDuties: true,
      multiStepCapable: true,
    },
    summary: "Single APPROVER role; author cannot approve. Extra steps allowed later.",
    neededFor: ["FR-11"],
    confirmWith: "BCM policy",
    status: DecisionStatus.DEFAULTED,
  },
  D6: {
    id: "D6",
    title: "Crisis invocation extensibility",
    value: {
      assumed: "unknown",
      phase0Obligation: "match_bcp_linkage_shape",
      invocationUi: false,
    },
    summary:
      "Unknown whether Crisis lookup is generic or BCP-hardcoded. Match BCP linkage. No invocation UI.",
    neededFor: ["FR-22", "FR-23", "FR-24", "FR-25", "FR-26", "FR-2"],
    confirmWith: "Crisis team that built the BCP link",
    status: DecisionStatus.DEFAULTED,
  },
  D7: {
    id: "D7",
    title: "ITDR-initiated invocation for small outages",
    value: false,
    summary: "No. Invocation remains Crisis-owned.",
    neededFor: ["PRD-§10"],
    confirmWith: "Product",
    status: DecisionStatus.LOCKED,
  },
});

export function listDecisions() {
  return Object.values(decisions);
}

export function recertificationMonths(tier) {
  const months = decisions.D4.value.byTier[String(tier)] ?? decisions.D4.value.byTier[tier];
  return months ?? 12;
}
