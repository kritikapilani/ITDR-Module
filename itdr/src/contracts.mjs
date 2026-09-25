/**
 * Sprint 0 integration contracts (mocked).
 * Canonical field names for BIA, Testing, BCP, Crisis-compatible DR plan, CMDB.
 * No production persistence schema is implied.
 */

import { decisions } from "./decisions.mjs";

export const BIA_APPLICATION_ID = decisions.D2.value.identityField;

/** BCP invocation lookup shape. DR plans must use the same `links` structure (D6 / FR-2). */
export const BCP_LINKAGE_CONTRACT = Object.freeze({
  name: "BcpPlanLinkage",
  fields: {
    planId: "string",
    planType: "BCP",
    versionId: "string",
    title: "string",
    ownerUserId: "string",
    status: "draft|in_review|approved|superseded|retired",
    links: [
      {
        processId: "string|null",
        assetId: "string|null",
        applicationId: "string (BIA application id)",
      },
    ],
  },
});

export const CRISIS_COMPATIBLE_DR_PLAN_CONTRACT = Object.freeze({
  name: "CrisisCompatibleDrPlan",
  note: "Phase 0 obligation is data shape only. No invocation UI (D6, D7).",
  fields: {
    planId: "string",
    planType: "DR",
    versionId: "string",
    title: "string",
    ownerUserId: "string",
    status: "draft|in_review|approved|superseded|retired",
    links: BCP_LINKAGE_CONTRACT.fields.links,
    target: { biaApplicationId: "string", name: "string" },
    roles: [{ role: "string", userId: "string", displayName: "string" }],
    steps: [{ stepId: "string", order: "number", instruction: "string" }],
  },
  requiredForLookup: ["planId", "planType", "versionId", "title", "ownerUserId", "links"],
});

export const BIA_READ_CONTRACT = Object.freeze({
  name: "BiaReadAdapter",
  direction: "BIA → ITDR (read only)",
  identityField: BIA_APPLICATION_ID,
  operations: {
    listApplications: {
      returns: [
        {
          biaApplicationId: "string",
          name: "string",
          tenantId: "string",
          criticality: "string|null",
          tier: "1|2|3|null",
          processes: [
            {
              processId: "string",
              name: "string",
              rtoMinutes: "number|null",
              rpoMinutes: "number|null",
            },
          ],
        },
      ],
    },
  },
  writesToBia: false,
  changeSignal: "bia.application.changed (event or poll)",
});

export const TESTING_CONTRACT = Object.freeze({
  name: "TestingModule",
  direction: "bidirectional, split ownership",
  testTypeCode: decisions.D3.value.testType,
  bindField: decisions.D3.value.bindField,
  operations: {
    registerTestType: { code: "DR_TEST", label: "DR Test" },
    createTestRecord: {
      testType: "DR_TEST",
      planVersionId: "string (required)",
      targetBiaApplicationId: "string",
      ownerUserId: "string",
      cycle: "ISO-8601 duration or policy window",
    },
    ingestResult: {
      resultId: "string",
      planVersionId: "string (required to count toward readiness)",
      outcome: "pass|fail|partial",
      completedAt: "ISO-8601",
      testerUserId: "string",
      evidenceRef: "string|null",
      targetRtoMinutes: "number|null",
      targetRpoMinutes: "number|null",
      actualRtoMinutes: "number|null",
      actualRpoMinutes: "number|null",
      exerciseMode: "tabletop|simulation|full_failover",
      stepResults: [{ stepId: "string", outcome: "pass|fail|na" }],
    },
  },
  testingMustNotStore: "drReady",
  schedulerOfRecord: "Testing",
});

export const CMDB_CONTRACT = Object.freeze({
  name: "CmdbAdapter",
  direction: "inbound to ITDR",
  status: "interface only (D1); production sync is Phase 3 unless source is confirmed",
  minimumPayload: {
    ciId: "string",
    name: "string",
    type: "application|infrastructure|datastore|network|identity|third_party",
    techOwner: "string|null",
    biaApplicationId: "string|null",
    relationships: [{ fromCiId: "string", toCiId: "string", type: "string" }],
  },
});

export function mostDemandingObjectives(processes) {
  const rtos = processes.map((p) => p.rtoMinutes).filter((n) => n != null);
  const rpos = processes.map((p) => p.rpoMinutes).filter((n) => n != null);
  return {
    rtoMinutes: rtos.length ? Math.min(...rtos) : null,
    rpoMinutes: rpos.length ? Math.min(...rpos) : null,
  };
}

export function isBoundDrTest(result) {
  return result?.testType === TESTING_CONTRACT.testTypeCode && Boolean(result?.planVersionId);
}

const LOOKUP_FIELDS = CRISIS_COMPATIBLE_DR_PLAN_CONTRACT.requiredForLookup;

export function assertCrisisCompatible(plan) {
  const missing = LOOKUP_FIELDS.filter((field) => plan[field] == null);
  if (missing.length) {
    const error = new Error(`Crisis-incompatible plan; missing ${missing.join(", ")}`);
    error.statusCode = 400;
    error.code = "CRISIS_SHAPE";
    throw error;
  }
  if (plan.planType !== "DR") {
    const error = new Error("Crisis-compatible DR plan must have planType=DR");
    error.statusCode = 400;
    throw error;
  }
  if (!Array.isArray(plan.links)) {
    const error = new Error("links must match BCP linkage structure");
    error.statusCode = 400;
    throw error;
  }
  for (const link of plan.links) {
    if (!link.applicationId) {
      const error = new Error("Each link requires applicationId (BIA application id)");
      error.statusCode = 400;
      throw error;
    }
  }
  return true;
}

export function catalog() {
  return {
    bia: BIA_READ_CONTRACT,
    testing: TESTING_CONTRACT,
    bcpLinkage: BCP_LINKAGE_CONTRACT,
    crisisCompatibleDrPlan: CRISIS_COMPATIBLE_DR_PLAN_CONTRACT,
    cmdb: CMDB_CONTRACT,
    decisionsEncoded: { D2: decisions.D2.value, D3: decisions.D3.value, D6: decisions.D6.value },
  };
}
