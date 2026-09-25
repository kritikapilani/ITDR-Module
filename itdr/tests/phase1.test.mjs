import { start } from "../src/server.mjs";
import { addMonths } from "../src/httpError.mjs";
import { ReadinessStatus } from "../src/readiness.mjs";

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

async function publishPayments() {
  const admin = await signIn(port, "ADMIN");
  const owner = await signIn(port, "PLAN_OWNER");
  const approver = await signIn(port, "APPROVER");
  let res = await http(port, "/api/itdr/targets/bia-app-payments", {
    method: "PATCH",
    sid: admin,
    body: { primaryOwnerUserId: "user-plan_owner", backupOwnerUserId: "user-admin", strategy: "hot_site" },
  });
  assert(res.status === 200, `assign ${res.status} ${res.data.error}`);
  await http(port, "/api/itdr/targets/bia-app-payments/ack", { method: "POST", sid: owner, body: {} });
  res = await http(port, "/api/itdr/targets/bia-app-payments/plan", { method: "POST", sid: owner, body: {} });
  if (res.status === 409) {
    res = await http(port, "/api/itdr/targets/bia-app-payments", { sid: owner });
  } else {
    assert(res.status === 201 || res.status === 200, `draft ${res.status} ${res.data.error}`);
  }
  const target = res.data.draft ? res.data : (await http(port, "/api/itdr/targets/bia-app-payments", { sid: owner })).data;
  const versionId = target.draft.versionId;
  res = await http(port, `/api/itdr/versions/${versionId}`, {
    method: "PATCH",
    sid: owner,
    body: {
      etag: target.draft.etag,
      contacts: [
        { role: "recovery_lead", name: "Alex Owner", email: "alex@example.com" },
        { role: "escalation", name: "Riley", email: "riley@example.com" },
      ],
    },
  });
  assert(res.status === 200, `contacts ${res.status} ${res.data.error}`);
  if (res.data.draft.status === "draft") {
    res = await http(port, `/api/itdr/versions/${versionId}/submit`, { method: "POST", sid: owner, body: {} });
    assert(res.status === 200, `submit ${res.status} ${res.data.error}`);
  }
  return { admin, owner, approver, versionId, etag: res.data.draft?.etag };
}

console.log("Phase 1 exit criteria\n");

await test("targets are seeded from BIA with inherited RTO/RPO", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/coverage", { sid });
  assert(res.status === 200, `coverage ${res.status}`);
  const pay = res.data.rows.find((r) => r.biaApplicationId === "bia-app-payments");
  assert(pay.objectives.inherited.rtoMinutes === 120, "D2 roll-up");
  assert(pay.objectives.inherited.rpoMinutes === 5, "D2 rpo");
  assert(pay.readiness.status === "not_started", pay.readiness.status);
  assert(pay.readiness.ready === false, "not ready");
  assert(res.data.kpi.denominator === 2, "tier 1/2 population");
  assert(res.data.kpi.percent === 0, "none approved yet");
});

await test("cannot create a target without a BIA id", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/targets", { method: "POST", sid, body: { name: "shadow" } });
  assert(res.status === 400 && res.data.code === "EC-TGT-01", JSON.stringify(res.data));
});

await test("override without justification is rejected", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/targets/bia-app-payments", {
    method: "PATCH",
    sid,
    body: { rtoOverrideMinutes: 30 },
  });
  assert(res.status === 400 && res.data.code === "FR-4", res.data.error);
});

await test("same primary and backup owner is rejected", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/targets/bia-app-payments", {
    method: "PATCH",
    sid,
    body: { primaryOwnerUserId: "user-plan_owner", backupOwnerUserId: "user-plan_owner" },
  });
  assert(res.status === 400, res.data.error);
});

await test("Plan Owner is forbidden on another application's draft", async () => {
  const owner = await signIn(port, "PLAN_OWNER");
  const res = await http(port, "/api/itdr/targets/bia-app-hr", { sid: owner });
  assert(res.status === 403, `expected 403 got ${res.status}`);
});

await test("wiki submit is blocked until RTO override (BIA gap)", async () => {
  const admin = await signIn(port, "ADMIN");
  await http(port, "/api/itdr/targets/bia-app-wiki", {
    method: "PATCH",
    sid: admin,
    body: { primaryOwnerUserId: "user-plan_owner", backupOwnerUserId: "user-admin", strategy: "backup_restore" },
  });
  const owner = await signIn(port, "PLAN_OWNER");
  let res = await http(port, "/api/itdr/targets/bia-app-wiki/plan", { method: "POST", sid: owner, body: {} });
  assert(res.status === 201 || res.status === 200, res.data.error);
  res = await http(port, `/api/itdr/versions/${res.data.draft.versionId}`, {
    method: "PATCH",
    sid: owner,
    body: { etag: res.data.draft.etag, contacts: [{ role: "recovery_lead", name: "Alex", email: "a@x" }] },
  });
  res = await http(port, `/api/itdr/versions/${res.data.draft.versionId}/submit`, { method: "POST", sid: owner, body: {} });
  assert(res.status === 400 && res.data.code === "EC-BIA-01", res.data.error);
});

await test("dependency cycle is rejected", async () => {
  const admin = await signIn(port, "ADMIN");
  await http(port, "/api/itdr/targets/bia-app-payments/assets", {
    method: "POST",
    sid: admin,
    body: { assetId: "asset-id-a", name: "ID", type: "identity" },
  });
  const t = await http(port, "/api/itdr/targets/bia-app-payments", { sid: admin });
  const appId = t.data.assets.find((a) => a.type === "application").assetId;
  await http(port, "/api/itdr/targets/bia-app-payments/dependencies", {
    method: "POST",
    sid: admin,
    body: { fromAssetId: "asset-id-a", toAssetId: appId },
  });
  const cycle = await http(port, "/api/itdr/targets/bia-app-payments/dependencies", {
    method: "POST",
    sid: admin,
    body: { fromAssetId: appId, toAssetId: "asset-id-a" },
  });
  assert(cycle.status === 400 && cycle.data.code === "EC-AST-01", cycle.data.error);
});

await test("Plan Owner authors, Approver publishes, SoD blocks self-approve", async () => {
  const { owner, approver, versionId } = await publishPayments();
  const denied = await http(port, `/api/itdr/versions/${versionId}/approve`, { method: "POST", sid: owner, body: {} });
  assert(denied.status === 403, `sod ${denied.status} ${denied.data.error}`);
  const ok = await http(port, `/api/itdr/versions/${versionId}/approve`, { method: "POST", sid: approver, body: {} });
  assert(ok.status === 200, `approve ${ok.status} ${ok.data.error}`);
  assert(ok.data.approved.status === "approved", "approved");
  assert(ok.data.approved.snapshot.inheritedRtoMinutes === 120, "snapshot");
  assert(ok.data.readiness.status === ReadinessStatus.APPROVED_UNTESTED, ok.data.readiness.status);
  assert(ok.data.readiness.ready === false, "still not ready without a test");
  assert(ok.data.crisisCompatible.planType === "DR", "crisis type");
  assert(ok.data.crisisCompatible.links[0].applicationId === "bia-app-payments", "bcp-like links");
});

await test("Tier 1/2 coverage KPI counts the approved plan", async () => {
  const sid = await signIn(port, "EXECUTIVE");
  const res = await http(port, "/api/itdr/coverage", { sid });
  assert(res.data.kpi.approvedNonExpired === 1, JSON.stringify(res.data.kpi));
  assert(res.data.kpi.percent === 50, "1 of 2");
  const pay = res.data.rows.find((r) => r.biaApplicationId === "bia-app-payments");
  assert(pay.readiness.status !== "ready", pay.readiness.status);
});

await test("BIA tighten flags drift and does not rewrite the approved plan", async () => {
  const admin = await signIn(port, "ADMIN");
  const before = await http(port, "/api/itdr/targets/bia-app-payments", { sid: admin });
  const snapRto = before.data.approved.snapshot.inheritedRtoMinutes;
  const body = before.data.approved.steps[0].instruction;
  const patch = await http(port, "/api/itdr/bia/applications/bia-app-payments", {
    method: "PATCH",
    sid: admin,
    body: {
      processes: before.data.processes.map((p) => ({ ...p, rtoMinutes: 30 })),
    },
  });
  assert(patch.status === 200, patch.data.error);
  assert(patch.data.readiness.status === ReadinessStatus.BIA_DRIFT, patch.data.readiness.status);
  assert(patch.data.readiness.drift.kind === "tightening", JSON.stringify(patch.data.readiness.drift));
  assert(patch.data.approved.snapshot.inheritedRtoMinutes === snapRto, "snapshot frozen");
  assert(patch.data.approved.steps[0].instruction === body, "runbook frozen");
});

await test("approved version cannot be edited in place", async () => {
  const owner = await signIn(port, "PLAN_OWNER");
  const t = await http(port, "/api/itdr/targets/bia-app-payments", { sid: owner });
  const res = await http(port, `/api/itdr/versions/${t.data.approved.versionId}`, {
    method: "PATCH",
    sid: owner,
    body: { etag: 1, title: "hack" },
  });
  assert(res.status === 409, res.data.error);
});

await test("updates re-enter approval via a new draft", async () => {
  const owner = await signIn(port, "PLAN_OWNER");
  const res = await http(port, "/api/itdr/targets/bia-app-payments/new-draft", { method: "POST", sid: owner, body: {} });
  assert(res.status === 201 || res.status === 200, res.data.error);
  assert(res.data.draft.status === "draft", res.data.draft.status);
  assert(res.data.approved.status === "approved", "current approved remains");
});

await test("Auditor can export coverage evidence", async () => {
  const sid = await signIn(port, "AUDITOR");
  const res = await http(port, "/api/itdr/export/coverage", { sid });
  assert(res.status === 200, res.data.error);
  assert(res.data.phase === 2, "phase");
  assert(res.data.kpi.denominator === 2, "kpi");
});

await test("stale review window marks expired without tests", async () => {
  clock = addMonths(new Date("2026-09-21T10:00:00.000Z"), 13);
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/targets/bia-app-payments", { sid });
  assert(res.data.readiness.status === ReadinessStatus.EXPIRED, res.data.readiness.status);
  clock = new Date("2026-09-21T10:00:00.000Z");
});

await test("invoke remains forbidden", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/invoke", { method: "POST", sid, body: {} });
  assert(res.status === 403, `got ${res.status}`);
});

await test("CMDB CI without BIA application does not create a target", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/cmdb/ingest", {
    method: "POST",
    sid,
    body: { ciId: "ci-orphan", name: "orphan", type: "application", biaApplicationId: "not-in-bia" },
  });
  assert(res.data.orphan === true, JSON.stringify(res.data));
  const cov = await http(port, "/api/itdr/coverage", { sid });
  assert(!cov.data.rows.some((r) => r.biaApplicationId === "not-in-bia"), "no shadow target");
});

server.close();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
