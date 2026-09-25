import { recertificationMonths } from "./decisions.mjs";
import { TESTING_CONTRACT } from "./contracts.mjs";
import { clone, fail, newId, addMonths } from "./httpError.mjs";
import { deriveTestOutcome } from "./testQuestionnaire.mjs";

export const DR_TEST = TESTING_CONTRACT.testTypeCode;
export const BCP_TEST = "BCP_TEST";
export const EXERCISE_MODES = Object.freeze(["tabletop", "simulation", "full_failover"]);

export function createTestingModule({ now = () => new Date() } = {}) {
  const tests = new Map();
  const types = [
    { code: BCP_TEST, label: "BCP Test" },
    { code: DR_TEST, label: "DR Test" },
  ];
  let createBlocked = false;

  function listOpenForVersion(planVersionId) {
    return [...tests.values()].find(
      (t) => t.testType === DR_TEST && t.planVersionId === planVersionId && ["open", "in_progress"].includes(t.status)
    );
  }

  return {
    types: () => clone(types),
    setCreateBlocked(value) {
      createBlocked = Boolean(value);
    },
    requestDrTest(req) {
      if (createBlocked) fail(503, "Testing module unavailable", "TESTING_DOWN");
      if (!req.planVersionId) fail(400, "planVersionId required to bind a DR Test", "EC-TST-01");
      const existing = listOpenForVersion(req.planVersionId);
      if (existing) return { ...clone(existing), reused: true };
      const test = {
        testId: newId("tst"),
        testType: DR_TEST,
        planVersionId: req.planVersionId,
        targetBiaApplicationId: req.targetBiaApplicationId,
        ownerUserId: req.ownerUserId || null,
        status: "open",
        requestedAt: now().toISOString(),
        dueAt: req.dueAt || null,
        scheduledAt: null,
        completedAt: null,
        outcome: null,
        testerUserId: null,
        evidenceRef: null,
        targetRtoMinutes: req.targetRtoMinutes ?? null,
        targetRpoMinutes: req.targetRpoMinutes ?? null,
        actualRtoMinutes: null,
        actualRpoMinutes: null,
        exerciseMode: null,
        stepResults: [],
        participants: [],
        gapsIssues: "",
        questionnaire: null,
        remediationRequired: false,
        retestDueAt: null,
        resultId: null,
        schedulerOfRecord: "Testing",
        cycleMonths: recertificationMonths(req.tier),
      };
      tests.set(test.testId, test);
      return { ...clone(test), reused: false };
    },
    schedule({ testType = DR_TEST, planVersionId, targetBiaApplicationId, ownerUserId, scheduledAt, dueAt, targetRtoMinutes, targetRpoMinutes, participants, exerciseMode }) {
      if (testType === DR_TEST && planVersionId) {
        const open = listOpenForVersion(planVersionId);
        if (open) {
          open.scheduledAt = scheduledAt || now().toISOString();
          if (dueAt) open.dueAt = dueAt;
          if (ownerUserId) open.ownerUserId = ownerUserId;
          if (exerciseMode) open.exerciseMode = exerciseMode;
          if (targetRtoMinutes != null) open.targetRtoMinutes = targetRtoMinutes;
          if (targetRpoMinutes != null) open.targetRpoMinutes = targetRpoMinutes;
          if (targetBiaApplicationId) open.targetBiaApplicationId = targetBiaApplicationId;
          if (participants) open.participants = participants;
          open.status = "in_progress";
          return clone(open);
        }
      }
      const test = {
        testId: newId("tst"),
        testType,
        planVersionId: planVersionId || null,
        targetBiaApplicationId: targetBiaApplicationId || null,
        ownerUserId: ownerUserId || null,
        status: scheduledAt ? "in_progress" : "open",
        requestedAt: now().toISOString(),
        dueAt: dueAt || null,
        scheduledAt: scheduledAt || now().toISOString(),
        completedAt: null,
        outcome: null,
        testerUserId: null,
        evidenceRef: null,
        targetRtoMinutes: targetRtoMinutes ?? null,
        targetRpoMinutes: targetRpoMinutes ?? null,
        actualRtoMinutes: null,
        actualRpoMinutes: null,
        exerciseMode: exerciseMode || null,
        stepResults: [],
        participants: participants || [],
        gapsIssues: "",
        questionnaire: null,
        remediationRequired: false,
        retestDueAt: null,
        resultId: null,
        schedulerOfRecord: "Testing",
      };
      tests.set(test.testId, test);
      return clone(test);
    },
    complete(testId, body, actor) {
      const test = tests.get(testId);
      if (!test) fail(404, "Test not found", "NOT_FOUND");
      if (body.resultId && test.resultId === body.resultId) return clone(test);
      test.status = "completed";
      test.completedAt = body.completedAt || now().toISOString();
      test.testerUserId = body.testerUserId || actor?.userId || null;
      test.evidenceRef = body.evidenceRef || null;
      test.exerciseMode = body.exerciseMode || test.exerciseMode;
      if (body.questionnaire) test.questionnaire = body.questionnaire;
      const answers = test.questionnaire?.answers;
      const derived = answers ? deriveTestOutcome(test.exerciseMode, answers) : "pending";
      if (derived && derived !== "pending") test.outcome = derived;
      else if (body.outcome) test.outcome = body.outcome;
      const tabletop = test.exerciseMode === "tabletop";
      if (tabletop && body.actualRtoMinutes == null && body.actualRpoMinutes == null) {
        test.actualRtoMinutes = null;
        test.actualRpoMinutes = null;
      } else {
        test.actualRtoMinutes = body.actualRtoMinutes ?? test.actualRtoMinutes;
        test.actualRpoMinutes = body.actualRpoMinutes ?? test.actualRpoMinutes;
      }
      if (body.targetRtoMinutes != null) test.targetRtoMinutes = body.targetRtoMinutes;
      if (body.targetRpoMinutes != null) test.targetRpoMinutes = body.targetRpoMinutes;
      test.stepResults = body.stepResults || test.stepResults || [];
      if (body.participants) test.participants = body.participants;
      if (body.gapsIssues != null) test.gapsIssues = body.gapsIssues;
      test.remediationRequired =
        body.remediationRequired != null
          ? Boolean(body.remediationRequired)
          : test.outcome === "fail" || test.outcome === "partial";
      if (body.retestDueAt) test.retestDueAt = body.retestDueAt;
      else if (test.remediationRequired && !test.retestDueAt) {
        test.retestDueAt = addMonths(now(), test.cycleMonths || recertificationMonths()).toISOString();
      }
      test.resultId = body.resultId || test.resultId || newId("res");
      if (body.planVersionId != null) test.planVersionId = body.planVersionId;
      return clone(test);
    },
    get(id) {
      const test = tests.get(id);
      if (!test) fail(404, "Test not found", "NOT_FOUND");
      return clone(test);
    },
    list(filter = {}) {
      return [...tests.values()]
        .filter((t) => {
          if (filter.targetBiaApplicationId && t.targetBiaApplicationId !== filter.targetBiaApplicationId) return false;
          if (filter.planVersionId && t.planVersionId !== filter.planVersionId) return false;
          if (filter.testType && t.testType !== filter.testType) return false;
          return true;
        })
        .map(clone)
        .sort((a, b) => String(b.completedAt || b.requestedAt).localeCompare(String(a.completedAt || a.requestedAt)));
    },
    _tests: tests,
  };
}
