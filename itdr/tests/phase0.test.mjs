import { start } from "../src/server.mjs";
import { decisions, listDecisions } from "../src/decisions.mjs";
import {
  assertCrisisCompatible,
  isBoundDrTest,
  mostDemandingObjectives,
  TESTING_CONTRACT,
} from "../src/contracts.mjs";
import { Permissions, Roles, can, isItdrRole, permissionsFor } from "../src/platform.mjs";
import { createMocks } from "../src/mocks.mjs";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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
  assert(res.status === 200 && res.sid, `sign-in ${role} failed`);
  return res.sid;
}

const { server, port } = await start({ port: 0 });

console.log("Phase 0 exit criteria\n");

await test("D1–D7 are recorded with owner semantics", () => {
  const ids = listDecisions().map((d) => d.id);
  assert(ids.join(",") === "D1,D2,D3,D4,D5,D6,D7", "missing decision ids");
  assert(decisions.D2.value.identityField === "biaApplicationId", "D2 identity");
  assert(decisions.D2.value.rtoRpoRollup === "most_demanding_min_non_null", "D2 rollup");
  assert(decisions.D6.value.invocationUi === false, "D6 no invoke UI");
  assert(decisions.D7.value === false, "D7 locked no");
  assert(decisions.D7.status === "LOCKED", "D7 status");
  assert(decisions.D4.value.byTier[1] === 12, "D4 default window");
});

await test("no production SQL schema was locked", () => {
  const skip = new Set(["node_modules", ".git"]);
  const sql = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".sql") || entry.name.endsWith(".prisma")) sql.push(full);
    }
  }
  walk(root);
  assert(sql.length === 0, `schema files found: ${sql.join(", ")}`);
});

await test("FR-30 roles exist; Test Manager is not an ITDR role", () => {
  for (const role of ["ADMIN", "PLAN_OWNER", "APPROVER", "AUDITOR", "EXECUTIVE"]) {
    assert(isItdrRole(role), role);
    assert(can(role, Permissions.ACCESS), `${role} access`);
  }
  assert(!isItdrRole(Roles.TEST_MANAGER), "test manager must not be ITDR role");
  assert(!can(Roles.TEST_MANAGER, Permissions.ACCESS), "test manager no access");
  assert(!can(Roles.ADMIN, Permissions.INVOKE), "nobody invokes from ITDR");
  assert(permissionsFor(Roles.AUDITOR).includes(Permissions.AUDIT_READ), "auditor read");
});

await test("BIA roll-up uses most demanding RTO/RPO", () => {
  const rolled = mostDemandingObjectives([
    { rtoMinutes: 240, rpoMinutes: 15 },
    { rtoMinutes: 120, rpoMinutes: 5 },
  ]);
  assert(rolled.rtoMinutes === 120 && rolled.rpoMinutes === 5, JSON.stringify(rolled));
  const empty = mostDemandingObjectives([{ rtoMinutes: null, rpoMinutes: null }]);
  assert(empty.rtoMinutes === null && empty.rpoMinutes === null, "nulls ignored");
});

await test("DR plan shape is Crisis-compatible with BCP links", () => {
  const sample = createMocks().crisisCompatibleSample();
  assertCrisisCompatible(sample);
  assert(sample.planType === "DR", "planType");
  assert(sample.links[0].applicationId === "bia-app-payments", "applicationId on link");
});

await test("unbound DR tests do not count", () => {
  assert(isBoundDrTest({ testType: TESTING_CONTRACT.testTypeCode, planVersionId: "v1" }));
  assert(!isBoundDrTest({ testType: TESTING_CONTRACT.testTypeCode, planVersionId: null }));
  assert(!isBoundDrTest({ testType: "BCP_TEST", planVersionId: "v1" }));
});

await test("health endpoint", async () => {
  const res = await http(port, "/api/health");
  assert(res.status === 200 && res.data.phase === 2, JSON.stringify(res.data));
});

await test("Admin can open the ITDR module", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/status", { sid });
  assert(res.status === 200, `status ${res.status}`);
  assert(res.data.phase === 2, "phase");
  assert(res.data.productionSchema === false, "no schema");
});

await test("Plan Owner, Approver, Auditor, Executive can access ITDR", async () => {
  for (const role of ["PLAN_OWNER", "APPROVER", "AUDITOR", "EXECUTIVE"]) {
    const sid = await signIn(port, role);
    const res = await http(port, "/api/itdr/status", { sid });
    assert(res.status === 200, `${role} ${res.status}`);
  }
});

await test("Test Manager is forbidden (403) on ITDR routes", async () => {
  const sid = await signIn(port, "TEST_MANAGER");
  const res = await http(port, "/api/itdr/status", { sid });
  assert(res.status === 403, `expected 403 got ${res.status}`);
});

await test("Incident Commander is forbidden on ITDR routes", async () => {
  const sid = await signIn(port, "INCIDENT_COMMANDER");
  const res = await http(port, "/api/itdr/status", { sid });
  assert(res.status === 403, `expected 403 got ${res.status}`);
});

await test("feature flag hides ITDR APIs (404)", async () => {
  const admin = await signIn(port, "ADMIN");
  const off = await http(port, "/api/itdr/flags", { method: "PUT", sid: admin, body: { itdrEnabled: false } });
  assert(off.status === 200 && off.data.itdrEnabled === false, "flag off");
  const hidden = await http(port, "/api/itdr/status", { sid: admin });
  assert(hidden.status === 404, `expected 404 got ${hidden.status}`);
  await http(port, "/api/itdr/flags", { method: "PUT", sid: admin, body: { itdrEnabled: true } });
});

await test("Plan Owner cannot read audit (403)", async () => {
  const sid = await signIn(port, "PLAN_OWNER");
  const res = await http(port, "/api/itdr/audit", { sid });
  assert(res.status === 403, `expected 403 got ${res.status}`);
});

await test("Auditor can read audit", async () => {
  const sid = await signIn(port, "AUDITOR");
  const res = await http(port, "/api/itdr/audit", { sid });
  assert(res.status === 200 && Array.isArray(res.data.entries), "audit list");
});

await test("invoke is not granted (D7)", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/invoke", { method: "POST", sid, body: {} });
  assert(res.status === 403, `expected 403 got ${res.status}`);
});

await test("Phase 2 placeholders are 501", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/placeholders/dr-test", { sid });
  assert(res.status === 501, `expected 501 got ${res.status}`);
});

await test("BIA spike returns inherited objectives without creating targets", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/spikes/bia", { sid });
  assert(res.status === 200, `bia ${res.status}`);
  const payments = res.data.applications.find((a) => a.biaApplicationId === "bia-app-payments");
  assert(payments.inheritedObjectives.rtoMinutes === 120, "rollup rto");
  assert(payments.inheritedObjectives.rpoMinutes === 5, "rollup rpo");
});

await test("contracts endpoint exposes BIA, Testing, BCP, Crisis, CMDB", async () => {
  const sid = await signIn(port, "ADMIN");
  const res = await http(port, "/api/itdr/contracts", { sid });
  assert(res.data.bia && res.data.testing && res.data.bcpLinkage, "core contracts");
  assert(res.data.crisisCompatibleDrPlan.fields.links, "crisis links");
  assert(res.data.cmdb.minimumPayload.ciId, "cmdb");
  assert(res.data.testing.testTypeCode === "DR_TEST", "DR_TEST");
  assert(res.data.testing.bindField === "planVersionId", "bind");
});

await test("unauthenticated ITDR is 401", async () => {
  const res = await http(port, "/api/itdr/status");
  assert(res.status === 401, `expected 401 got ${res.status}`);
});

server.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
