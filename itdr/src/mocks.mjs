/**
 * Sprint 0 adapter spikes — in-memory mocks only.
 * Confirms field contracts; does not persist Phase 1 entities.
 */

import {
  assertCrisisCompatible,
  isBoundDrTest,
  mostDemandingObjectives,
  TESTING_CONTRACT,
} from "./contracts.mjs";

const TENANT = "tenant-demo";

const BIA_APPLICATIONS = [
  {
    biaApplicationId: "bia-app-payments",
    name: "Payments Gateway",
    tenantId: TENANT,
    criticality: "high",
    tier: 1,
    processes: [
      { processId: "proc-settle", name: "Settlement", rtoMinutes: 240, rpoMinutes: 15 },
      { processId: "proc-auth", name: "Authorization", rtoMinutes: 120, rpoMinutes: 5 },
    ],
  },
  {
    biaApplicationId: "bia-app-hr",
    name: "HR Portal",
    tenantId: TENANT,
    criticality: "medium",
    tier: 2,
    processes: [{ processId: "proc-payroll", name: "Payroll", rtoMinutes: 1440, rpoMinutes: 60 }],
  },
  {
    biaApplicationId: "bia-app-wiki",
    name: "Internal Wiki",
    tenantId: TENANT,
    criticality: "low",
    tier: 3,
    processes: [{ processId: "proc-knowledge", name: "Knowledge access", rtoMinutes: null, rpoMinutes: null }],
  },
];

const BCP_PLANS = [
  {
    planId: "bcp-1",
    planType: "BCP",
    versionId: "bcp-1-v3",
    title: "Payments business continuity plan",
    ownerUserId: "user-bcm",
    status: "approved",
    links: [
      { processId: "proc-settle", assetId: "ci-pay-app", applicationId: "bia-app-payments" },
      { processId: "proc-auth", assetId: "ci-pay-app", applicationId: "bia-app-payments" },
    ],
  },
];

/** Example payload proving DR can use the same linkage keys as BCP. */
const SAMPLE_DR_PLAN_SHAPE = {
  planId: "dr-pay-1",
  planType: "DR",
  versionId: "dr-pay-1-v0-shape-only",
  title: "Payments Gateway technical recovery (shape spike — not a real plan)",
  ownerUserId: "user-owner",
  status: "draft",
  links: [{ processId: "proc-auth", assetId: "ci-pay-app", applicationId: "bia-app-payments" }],
  target: { biaApplicationId: "bia-app-payments", name: "Payments Gateway" },
  roles: [{ role: "recovery_lead", userId: "user-owner", displayName: "Alex Owner" }],
  steps: [{ stepId: "s1", order: 1, instruction: "Fail over payments cluster (placeholder)" }],
};

const CMDB_SAMPLE = {
  ciId: "ci-pay-app",
  name: "payments-gateway",
  type: "application",
  techOwner: "user-owner",
  biaApplicationId: "bia-app-payments",
  relationships: [{ fromCiId: "ci-pay-db", toCiId: "ci-pay-app", type: "depends_on" }],
};

export function createMocks() {
  assertCrisisCompatible(SAMPLE_DR_PLAN_SHAPE);

  return {
    listBiaApplications(tenantId) {
      return BIA_APPLICATIONS.filter((app) => app.tenantId === tenantId).map((app) => ({
        ...app,
        inheritedObjectives: mostDemandingObjectives(app.processes),
        wouldBecomeRecoveryTargetIn: "Phase 1",
      }));
    },
    listBcpLinks(biaApplicationId) {
      return BCP_PLANS.filter((plan) =>
        plan.links.some((link) => link.applicationId === biaApplicationId)
      );
    },
    crisisCompatibleSample() {
      return SAMPLE_DR_PLAN_SHAPE;
    },
    cmdbMinimumPayload() {
      return CMDB_SAMPLE;
    },
    testingContractSpike() {
      const bound = {
        resultId: "res-example",
        testType: TESTING_CONTRACT.testTypeCode,
        planVersionId: SAMPLE_DR_PLAN_SHAPE.versionId,
        outcome: "pass",
      };
      const unbound = {
        resultId: "res-unbound",
        testType: TESTING_CONTRACT.testTypeCode,
        planVersionId: null,
        outcome: "pass",
      };
      return {
        registerTestType: TESTING_CONTRACT.operations.registerTestType,
        boundCountsTowardReadiness: isBoundDrTest(bound),
        unboundCountsTowardReadiness: isBoundDrTest(unbound),
        schedulerOfRecord: TESTING_CONTRACT.schedulerOfRecord,
      };
    },
  };
}
