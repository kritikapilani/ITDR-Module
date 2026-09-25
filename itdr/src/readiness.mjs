import { decisions, recertificationMonths } from "./decisions.mjs";
import { mostDemandingObjectives, TESTING_CONTRACT } from "./contracts.mjs";
import { addMonths } from "./httpError.mjs";

export const ReadinessStatus = Object.freeze({
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  APPROVED_UNTESTED: "approved_untested",
  READY: "ready",
  FAILED_TEST: "failed_test",
  EXPIRED: "expired",
  BIA_DRIFT: "bia_drift",
  RETIRED: "retired",
  OUT_OF_SCOPE: "out_of_scope",
});

const PRIORITY = [
  ReadinessStatus.RETIRED,
  ReadinessStatus.FAILED_TEST,
  ReadinessStatus.EXPIRED,
  ReadinessStatus.BIA_DRIFT,
  ReadinessStatus.APPROVED_UNTESTED,
  ReadinessStatus.READY,
  ReadinessStatus.IN_PROGRESS,
  ReadinessStatus.NOT_STARTED,
  ReadinessStatus.OUT_OF_SCOPE,
];

function worseThanLive(claimed, live) {
  if (claimed == null || live == null) return false;
  return claimed > live;
}

function mappingKey(processes) {
  return (processes || [])
    .map((p) => p.processId)
    .filter(Boolean)
    .sort()
    .join(",");
}

function meetsTarget(test) {
  if (test.exerciseMode === "tabletop" && test.actualRtoMinutes == null && test.actualRpoMinutes == null) {
    return true;
  }
  if (test.actualRtoMinutes == null || test.actualRpoMinutes == null) return false;
  if (test.targetRtoMinutes != null && test.actualRtoMinutes > test.targetRtoMinutes) return false;
  if (test.targetRpoMinutes != null && test.actualRpoMinutes > test.targetRpoMinutes) return false;
  return true;
}

function stepsOk(test) {
  if (test.exerciseMode === "full_failover") {
    if (Array.isArray(test.stepResults) && test.stepResults.length > 0) return true;
    const answers = test.questionnaire?.answers || test.questionnaire;
    return Boolean(answers && (answers.procedureFollowed || answers.rtoMet));
  }
  return true;
}

export function evaluateLatestTest(tests, { currentVersionId, now, recertMonths, approvedAt }) {
  const ignored = [];
  const dr = (tests || []).filter((t) => {
    if (t.testType !== TESTING_CONTRACT.testTypeCode) return false;
    if (!t.planVersionId) {
      ignored.push({ testId: t.testId, reason: "unbound" });
      return false;
    }
    return true;
  });
  const completed = dr.filter((t) => t.completedAt && t.outcome);
  const forCurrent = completed
    .filter((t) => t.planVersionId === currentVersionId)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const latest = forCurrent[0] || null;
  const windowStart = addMonths(now, -recertMonths);
  const inCycle = Boolean(
    latest && new Date(latest.completedAt) >= windowStart && (!approvedAt || new Date(latest.completedAt) >= new Date(approvedAt))
  );

  if (!latest) {
    return { latest: null, pass: false, fail: false, inCycle: false, meetsRtoRpo: false, ignored, reason: "no_current_version_result" };
  }

  const missingActuals =
    latest.exerciseMode === "tabletop"
      ? false
      : latest.actualRtoMinutes == null || latest.actualRpoMinutes == null;
  const unmet = !missingActuals && !meetsTarget(latest);
  const incompleteSteps = !stepsOk(latest);
  const failOutcome = latest.outcome === "fail" || latest.outcome === "partial";
  const fail = Boolean(failOutcome || unmet);
  const pass = Boolean(latest.outcome === "pass" && inCycle && meetsTarget(latest) && !incompleteSteps);

  return {
    latest,
    pass,
    fail,
    inCycle,
    meetsRtoRpo: meetsTarget(latest),
    missingActuals,
    incompleteSteps,
    ignored,
    reason: failOutcome
      ? "failed_or_partial"
      : unmet
        ? "unmet_rto_rpo"
        : missingActuals
          ? "missing_actual_rto_rpo"
          : incompleteSteps
            ? "incomplete_step_results"
            : !inCycle
              ? "out_of_cycle"
              : pass
                ? "pass"
                : "not_pass",
  };
}

export function computeReadiness({ target, draftVersion, approvedVersion, liveBia, now = new Date(), tests = [] }) {
  if (target?.retired) {
    return {
      status: ReadinessStatus.RETIRED,
      inCoverageDenominator: false,
      ready: false,
      dimensions: { coverage: false, approval: false, currency: false, alignment: false, test: false },
      gaps: ["retired"],
      drift: null,
      testEval: null,
    };
  }

  if (!liveBia) {
    return {
      status: ReadinessStatus.OUT_OF_SCOPE,
      inCoverageDenominator: false,
      ready: false,
      dimensions: { coverage: false, approval: false, currency: false, alignment: false, test: false },
      gaps: ["out_of_bia_scope"],
      drift: null,
      testEval: null,
    };
  }

  const liveObj = mostDemandingObjectives(liveBia.processes || []);
  const biaGap = liveObj.rtoMinutes == null && liveObj.rpoMinutes == null;
  const hasDraft = draftVersion?.status === "draft" || draftVersion?.status === "in_review";
  const approved = approvedVersion?.status === "approved" ? approvedVersion : null;
  const coverage = Boolean(target.planId);
  const approval = Boolean(approved);
  const months = recertificationMonths(target.tier);
  const gaps = [];
  if (biaGap) gaps.push("bia_gap_missing_rto_rpo");

  let currency = false;
  let expired = false;
  if (approved) {
    const expiresAt = addMonths(new Date(approved.approvedAt), months);
    currency = now.getTime() <= expiresAt.getTime();
    expired = !currency;
    if (expired) gaps.push("review_window_elapsed");
  }

  let alignment = true;
  let drift = null;
  const overrideRto = target.rtoOverrideMinutes;
  const overrideRpo = target.rpoOverrideMinutes;
  const claimedRto = approved?.claimedRtoMinutes ?? draftVersion?.claimedRtoMinutes ?? overrideRto ?? liveObj.rtoMinutes;
  const claimedRpo = approved?.claimedRpoMinutes ?? draftVersion?.claimedRpoMinutes ?? overrideRpo ?? liveObj.rpoMinutes;

  if (worseThanLive(claimedRto, liveObj.rtoMinutes) || worseThanLive(claimedRpo, liveObj.rpoMinutes)) {
    alignment = false;
    gaps.push("claimed_worse_than_live_bia");
  }
  if (worseThanLive(overrideRto, liveObj.rtoMinutes) || worseThanLive(overrideRpo, liveObj.rpoMinutes)) {
    alignment = false;
    gaps.push("override_worse_than_live_bia");
  }

  if (approved?.snapshot) {
    const snap = approved.snapshot;
    const rtoChanged = snap.inheritedRtoMinutes !== liveObj.rtoMinutes;
    const rpoChanged = snap.inheritedRpoMinutes !== liveObj.rpoMinutes;
    const mapChanged = snap.mappingKey !== mappingKey(liveBia.processes);
    if (rtoChanged || rpoChanged || mapChanged) {
      const tightening =
        (liveObj.rtoMinutes != null && snap.inheritedRtoMinutes != null && liveObj.rtoMinutes < snap.inheritedRtoMinutes) ||
        (liveObj.rpoMinutes != null && snap.inheritedRpoMinutes != null && liveObj.rpoMinutes < snap.inheritedRpoMinutes);
      drift = {
        kind: mapChanged && !rtoChanged && !rpoChanged ? "mapping" : tightening ? "tightening" : "loosening",
        snapshot: snap,
        live: liveObj,
      };
      gaps.push("bia_snapshot_drift");
    }
  }

  const testEval = approved
    ? evaluateLatestTest(tests, {
        currentVersionId: approved.versionId,
        now,
        recertMonths: months,
        approvedAt: approved.approvedAt,
      })
    : { pass: false, fail: false, latest: null, ignored: [], reason: "no_approved_version" };

  if (testEval.fail) gaps.push("failed_test_or_unmet_rto");
  if (testEval.missingActuals) gaps.push("missing_actual_rto_rpo");
  if (testEval.incompleteSteps) gaps.push("incomplete_step_results");
  if (approved && !testEval.pass && !testEval.fail) gaps.push("untested_current_version");
  for (const ign of testEval.ignored || []) gaps.push(`ignored_unbound:${ign.testId}`);

  const dimensions = {
    coverage,
    approval,
    currency,
    alignment,
    test: Boolean(testEval.pass),
  };

  let status;
  if (!coverage && !target.primaryOwnerUserId && !hasDraft) status = ReadinessStatus.NOT_STARTED;
  else if (!approved) status = ReadinessStatus.IN_PROGRESS;
  else if (testEval.fail) status = ReadinessStatus.FAILED_TEST;
  else if (expired) status = ReadinessStatus.EXPIRED;
  else if (!alignment || drift) status = ReadinessStatus.BIA_DRIFT;
  else if (testEval.pass) status = ReadinessStatus.READY;
  else status = ReadinessStatus.APPROVED_UNTESTED;

  return {
    status,
    inCoverageDenominator: true,
    ready: status === ReadinessStatus.READY,
    phase: 2,
    policy: { recertificationMonths: months, sod: decisions.D5.value.segregationOfDuties },
    dimensions,
    gaps,
    drift,
    testEval: {
      pass: testEval.pass,
      fail: testEval.fail,
      inCycle: testEval.inCycle,
      meetsRtoRpo: testEval.meetsRtoRpo,
      reason: testEval.reason,
      latestTestId: testEval.latest?.testId || null,
      latestResultId: testEval.latest?.resultId || null,
      exerciseMode: testEval.latest?.exerciseMode || null,
    },
    liveObjectives: liveObj,
    claimedObjectives: { rtoMinutes: claimedRto, rpoMinutes: claimedRpo },
    kpiEligible: Boolean(approved && currency),
    evidence: {
      planVersionId: approved?.versionId || null,
      approvedBy: approved?.approvedBy || null,
      approvedAt: approved?.approvedAt || null,
      testId: testEval.latest?.testId || null,
      testCompletedAt: testEval.latest?.completedAt || null,
    },
  };
}

export function pickStatus(statuses) {
  return PRIORITY.find((s) => statuses.includes(s)) || ReadinessStatus.NOT_STARTED;
}

export function mappingKeyFromProcesses(processes) {
  return mappingKey(processes);
}
