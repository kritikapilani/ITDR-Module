import { start } from "../src/server.mjs";
import { addMonths } from "../src/httpError.mjs";
import { ReadinessStatus } from "../src/readiness.mjs";
import { createTestingModule } from "../src/testingModule.mjs";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
}

function cookie(setCookie) {
  const match = String(setCookie || "").match(/sid=([^;]+)/);
  return match ? match[1] : null;
}

async function http(port, path, { method = "GET", sid, body } = {}) {
  const headers = {};
  if (sid) headers.cookie = `sid=${sid}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, sid: cookie(res.headers.get("set-cookie")) || sid };
}

async function signIn(port, role) {
  const res = await http(port, "/api/session", { method: "PUT", body: { role, tenantId: "tenant-demo" } });
  assert(res.status === 200 && res.sid, `sign-in ${role} failed ${res.status}`);
  return res.sid;
}

let clock = new Date("2026-09-21T10:00:00.000Z");
const { server, port } = await start({ port: 0, now: () => new Date(clock.getTime()) });

async function publish(appId = "bia-app-payments", strategy = "hot_site") {
  const admin = await signIn(port, "ADMIN");
  const owner = await signIn(port, "PLAN_OWNER");
  const approver = await signIn(port, "APPROVER");
  await http(port, `/api/itdr/targets/${appId}`, {
    method: "PATCH",
    sid: admin,
    body: { primaryOwnerUserId: "user-plan_owner", backupOwnerUserId: "user-admin", strategy },
  });
  let res = await http(port, `/api/itdr/targets/${appId}/plan`, { method: "POST", sid: owner, body: {} });
  if (res.status === 409) res = await http(port, `/api/itdr/targets/${appId}`, { sid: owner });
  const versionId = res.data.draft.versionId;
  res = await http(port, `/api/itdr/versions/${versionId}`, {
    method: "PATCH",
    sid: owner,
    body: {
      etag: res.data.draft.etag,
      contacts: [{ role: "recovery_lead", name: "Alex Owner", email: "a@x.com" }],
    },
  });
  if (res.data.draft.status === "draft") {
    res = await http(port, `/api/itdr/versions/${versionId}/submit`, { method: "POST", sid: owner, body: {} });
  }
  if (res.data.draft?.status === "in_review") {
    res = await http(port, `/api/itdr/versions/${versionId}/approve`, { method: "POST", sid: approver, body: {} });
  }
  assert(res.status === 200 && res.data.approved, `approve ${res.status} ${res.data.error}`);
  return { admin, owner, approver, versionId: res.data.approved.versionId, target: res.data, testRequest: res.data.testRequest };
}

async function passTest(sid, testId, planVersionId, extra = {}) {
  return http(port, `/api/testing/tests/${testId}/complete`, {
    method: "POST",
    sid,
    body: {
      outcome: "pass",
      planVersionId,
      exerciseMode: "tabletop",
      actualRtoMinutes: 60,
      actualRpoMinutes: 5,
      targetRtoMinutes: 120,
      targetRpoMinutes: 5,
      stepResults: [{ stepId: "s1", outcome: "na" }],
      ...extra,
    },
  });
}

console.log("Phase 2 exit criteria\n");

await test("Testing lists DR Test alongside BCP Test", async () => {
  const sid = await signIn(port, "TEST_MANAGER");
  const res = await http(port, "/api/testing/types", { sid });
  const codes = res.data.types.map((t) => t.code);
  assert(codes.includes("DR_TEST") && codes.includes("BCP_TEST"), JSON.stringify(codes));
});

await test("Testing options expose applications and DR result fields", async () => {
  const sid = await signIn(port, "TEST_MANAGER");
  const res = await http(port, "/api/testing/options", { sid });
  assert(res.status === 200, `options ${res.status}`);
  const codes = (res.data.types || []).map((t) => t.code);
  assert(codes.includes("DR_TEST") && codes.includes("BCP_TEST"), JSON.stringify(codes));
  assert((res.data.exerciseModes || []).includes("full_failover"), "modes");
  assert((res.data.outcomes || []).includes("partial"), "outcomes");
  assert((res.data.applications || []).some((a) => a.biaApplicationId === "bia-app-payments"), "apps");
});

await test("schedule popup fields persist exercise mode and participants", async () => {
  const sid = await signIn(port, "TEST_MANAGER");
  const res = await http(port, "/api/testing/tests", {
    method: "POST",
    sid,
    body: {
      testType: "DR_TEST",
      targetBiaApplicationId: "bia-app-payments",
      exerciseMode: "simulation",
      scheduledAt: "2026-10-01T09:00:00.000Z",
      participants: ["user-test_manager", "user-plan_owner"],
      targetRtoMinutes: 120,
      targetRpoMinutes: 5,
    },
  });
  assert(res.status === 201, `schedule ${res.status} ${res.data.error}`);
  assert(res.data.exerciseMode === "simulation", JSON.stringify(res.data));
  assert(res.data.participants.includes("user-plan_owner"), JSON.stringify(res.data.participants));
  assert(res.data.schedulerOfRecord === "Testing", res.data.schedulerOfRecord);
});

await test("Test Manager is still forbidden on ITDR routes", async () => {
  const sid = await signIn(port, "TEST_MANAGER");
  const res = await http(port, "/api/itdr/coverage", { sid });
  assert(res.status === 403, `got ${res.status}`);
});

await test("publish requests a bound DR Test without rolling back approval if Testing is down", async () => {
  const testing = createTestingModule({ now: () => clock });
  testing.setCreateBlocked(true);
  const isolated = await start({ port: 0, now: () => clock, testing });
  const admin = await signIn(isolated.port, "ADMIN");
  const owner = await signIn(isolated.port, "PLAN_OWNER");
  const approver = await signIn(isolated.port, "APPROVER");
  await http(isolated.port, "/api/itdr/targets/bia-app-payments", {
    method: "PATCH",
    sid: admin,
    body: { primaryOwnerUserId: "user-plan_owner", backupOwnerUserId: "user-admin", strategy: "hot_site" },
  });
  let res = await http(isolated.port, "/api/itdr/targets/bia-app-payments/plan", { method: "POST", sid: owner, body: {} });
  res = await http(isolated.port, `/api/itdr/versions/${res.data.draft.versionId}`, {
    method: "PATCH",
    sid: owner,
    body: { etag: res.data.draft.etag, contacts: [{ role: "lead", name: "Alex", email: "a@x" }] },
  });
  await http(isolated.port, `/api/itdr/versions/${res.data.draft.versionId}/submit`, { method: "POST", sid: owner, body: {} });
  res = await http(isolated.port, `/api/itdr/versions/${res.data.draft.versionId}/approve`, { method: "POST", sid: approver, body: {} });
  assert(res.status === 200 && res.data.approved.status === "approved", "approval stands");
  assert(res.data.testRequest.queued === true, JSON.stringify(res.data.testRequest));
  isolated.server.close();
});

await test("ready requires in-cycle pass on the current approved version", async () => {
  const { versionId, testRequest } = await publish();
  const tm = await signIn(port, "TEST_MANAGER");
  assert(testRequest.ok && testRequest.testId, JSON.stringify(testRequest));
  const before = await http(port, "/api/itdr/targets/bia-app-payments", { sid: await signIn(port, "ADMIN") });
  assert(before.data.readiness.status === ReadinessStatus.APPROVED_UNTESTED, before.data.readiness.status);
  assert(before.data.readiness.ready === false, "not ready yet");
  const done = await passTest(tm, testRequest.testId, versionId);
  assert(done.status === 200, done.data.error);
  const after = await http(port, "/api/itdr/targets/bia-app-payments", { sid: await signIn(port, "ADMIN") });
  assert(after.data.readiness.status === ReadinessStatus.READY, after.data.readiness.status);
  assert(after.data.readiness.ready === true, "ready");
  assert(after.data.readiness.evidence.testId === testRequest.testId, "evidence drills to test");
});

await test("unbound and BCP tests do not count", async () => {
  const tm = await signIn(port, "TEST_MANAGER");
  const unbound = await http(port, "/api/testing/tests", {
    method: "POST",
    sid: tm,
    body: { testType: "DR_TEST", targetBiaApplicationId: "bia-app-payments" },
  });
  await http(port, `/api/testing/tests/${unbound.data.testId}/complete`, {
    method: "POST",
    sid: tm,
    body: { outcome: "pass", actualRtoMinutes: 10, actualRpoMinutes: 1, targetRtoMinutes: 120, targetRpoMinutes: 5, exerciseMode: "tabletop" },
  });
  const bcp = await http(port, "/api/testing/tests", {
    method: "POST",
    sid: tm,
    body: { testType: "BCP_TEST", targetBiaApplicationId: "bia-app-payments", planVersionId: "ignored" },
  });
  await http(port, `/api/testing/tests/${bcp.data.testId}/complete`, {
    method: "POST",
    sid: tm,
    body: { outcome: "pass", planVersionId: "ignored", actualRtoMinutes: 10, actualRpoMinutes: 1 },
  });
  const ingest = await http(port, "/api/itdr/tests/ingest", {
    method: "POST",
    sid: await signIn(port, "ADMIN"),
    body: { resultId: "res-unbound-1", outcome: "pass" },
  });
  assert(ingest.data.ignored === true, JSON.stringify(ingest.data));
});

await test("pass with unmet actual RTO is failed_test even if Testing said pass", async () => {
  const published = await publish("bia-app-hr", "warm_site");
  const tm = await signIn(port, "TEST_MANAGER");
  const done = await passTest(tm, published.testRequest.testId, published.versionId, { actualRtoMinutes: 8000 });
  assert(done.status === 200, done.data.error);
  const after = await http(port, "/api/itdr/targets/bia-app-hr", { sid: await signIn(port, "ADMIN") });
  assert(after.data.readiness.status === ReadinessStatus.FAILED_TEST, after.data.readiness.status);
  assert(after.data.readiness.ready === false, "not ready");
});

await test("ready cannot be set by the user", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/targets/bia-app-payments", { method: "PATCH", sid, body: { ready: true } });
  assert(res.status === 403 && res.data.code === "EC-APR-17", res.data.error);
});

await test("dashboard KPIs are labelled Tier 1/2 and drill to evidence", async () => {
  const sid = await signIn(port, "EXECUTIVE");
  const res = await http(port, "/api/itdr/dashboard", { sid });
  assert(res.status === 200, res.data.error);
  assert(res.data.kpis.currentPlans.population === "tier_1_2_in_bia_scope", "population");
  assert(res.data.kpis.testedInWindow.percent > 0, JSON.stringify(res.data.kpis.testedInWindow));
  const readyMember = res.data.kpis.testedInWindow.members.find((m) => m.biaApplicationId === "bia-app-payments");
  assert(readyMember.evidence.testId, JSON.stringify(readyMember));
  assert(res.data.remediations.some((r) => r.biaApplicationId === "bia-app-hr"), "hr remediation");
});

await test("ingest is idempotent on resultId", async () => {
  const admin = await signIn(port, "ADMIN");
  const t = await http(port, "/api/itdr/targets/bia-app-payments", { sid: admin });
  const testId = t.data.readiness.evidence.testId;
  const rec = await http(port, `/api/testing/tests`, { sid: await signIn(port, "TEST_MANAGER") });
  const row = rec.data.items.find((i) => i.testId === testId);
  const again = await http(port, "/api/itdr/tests/ingest", {
    method: "POST",
    sid: admin,
    body: { resultId: row.resultId, testId, planVersionId: row.planVersionId, outcome: "fail", testType: "DR_TEST" },
  });
  assert(again.data.idempotent === true, JSON.stringify(again.data));
  const still = await http(port, "/api/itdr/targets/bia-app-payments", { sid: admin });
  assert(still.data.readiness.status === ReadinessStatus.READY, still.data.readiness.status);
});

await test("new approved version is approved_untested until retested", async () => {
  const owner = await signIn(port, "PLAN_OWNER");
  const approver = await signIn(port, "APPROVER");
  let res = await http(port, "/api/itdr/targets/bia-app-payments/new-draft", { method: "POST", sid: owner, body: {} });
  res = await http(port, `/api/itdr/versions/${res.data.draft.versionId}`, {
    method: "PATCH",
    sid: owner,
    body: { etag: res.data.draft.etag, contacts: [{ role: "lead", name: "Alex", email: "a@x" }] },
  });
  await http(port, `/api/itdr/versions/${res.data.draft.versionId}/submit`, { method: "POST", sid: owner, body: {} });
  res = await http(port, `/api/itdr/versions/${res.data.draft.versionId}/approve`, { method: "POST", sid: approver, body: {} });
  assert(res.data.readiness.status === ReadinessStatus.APPROVED_UNTESTED, res.data.readiness.status);
  assert(res.data.readiness.ready === false, "old pass does not count");
});

await test("recertification tick requests a test when due and does not duplicate in-flight", async () => {
  clock = addMonths(new Date("2026-09-21T10:00:00.000Z"), 13);
  const admin = await signIn(port, "ADMIN");
  const tick = await http(port, "/api/itdr/recertification/tick", { method: "POST", sid: admin, body: {} });
  assert(tick.status === 200, tick.data.error);
  const first = tick.data.requested.find((r) => r.biaApplicationId === "bia-app-payments");
  assert(first, JSON.stringify(tick.data));
  const tick2 = await http(port, "/api/itdr/recertification/tick", { method: "POST", sid: admin, body: {} });
  const second = tick2.data.requested.find((r) => r.biaApplicationId === "bia-app-payments");
  assert(second.reused === true || second.ok === true, JSON.stringify(second));
  const t = await http(port, "/api/itdr/targets/bia-app-payments", { sid: admin });
  assert(t.data.readiness.status === ReadinessStatus.EXPIRED, t.data.readiness.status);
  clock = new Date("2026-09-21T10:00:00.000Z");
});

await test("process drill-down lists applications not a process-level plan", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/processes/proc-auth", { sid });
  assert(res.data.note.includes("no DR plan"), res.data.note);
  assert(res.data.applications.some((a) => a.biaApplicationId === "bia-app-payments"), JSON.stringify(res.data));
});

await test("structured questionnaire derives fail and stores answers", async () => {
  const sid = await signIn(port, "TEST_MANAGER");
  const created = await http(port, "/api/testing/tests", {
    method: "POST",
    sid,
    body: {
      testType: "DR_TEST",
      targetBiaApplicationId: "bia-app-payments",
      exerciseMode: "simulation",
      scheduledAt: "2026-10-02T09:00:00.000Z",
      participants: ["user-admin", "user-auditor"],
    },
  });
  assert(created.status === 201, `schedule ${created.status} ${created.data.error}`);
  const done = await http(port, `/api/testing/tests/${created.data.testId}/complete`, {
    method: "POST",
    sid,
    body: {
      exerciseMode: "simulation",
      completedAt: "2026-10-02T12:00:00.000Z",
      participants: ["user-admin", "user-auditor"],
      actualRtoMinutes: 180,
      actualRpoMinutes: 5,
      questionnaire: {
        answers: {
          procedureFollowed: "yes",
          rtoMet: "no",
          rpoMet: "yes",
          noManualIntervention: "yes",
          contactsReachable: "yes",
          dataLossBeyondRpo: "no",
          functionalChecksPassed: "yes",
          outdatedSteps: "no",
        },
      },
    },
  });
  assert(done.status === 200, done.data.error);
  assert(done.data.test.outcome === "fail", `expected fail got ${done.data.test.outcome}`);
  assert(done.data.test.questionnaire?.answers?.rtoMet === "no", "answers stored");
  assert(done.data.test.remediationRequired === true, "remediation auto-set");
});

await test("invoke remains out of scope", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/invoke", { method: "POST", sid, body: {} });
  assert(res.status === 403, `got ${res.status}`);
});

server.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
