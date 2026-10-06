import { start } from "../src/server.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

console.log("\n--- Merged ITDR Module & Master Plan Tests ---\n");

const { server, port } = await start({ port: 0 });

try {
  const adminSid = await signIn(port, "ADMIN");
  const planOwnerSid = await signIn(port, "PLAN_OWNER");

  // 1. Master Libraries Endpoint
  await test("GET /api/itdr/libraries returns Application, Site, and Environment libraries", async () => {
    const res = await http(port, "/api/itdr/libraries", { sid: adminSid });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(Array.isArray(res.data.applicationLibrary) && res.data.applicationLibrary.length >= 6, "applicationLibrary missing or empty");
    assert(Array.isArray(res.data.siteLibrary) && res.data.siteLibrary.length >= 6, "siteLibrary missing or empty");
    assert(Array.isArray(res.data.environmentLibrary) && res.data.environmentLibrary.length >= 4, "environmentLibrary missing or empty");
    assert(Array.isArray(res.data.scenarios) && res.data.scenarios.length >= 4, "scenarios missing");

    const coreBanking = res.data.applicationLibrary.find((a) => a.id === "app-core-banking" || a.name.includes("Banking"));
    assert(coreBanking, "core banking app missing from library");
    assert(coreBanking.name === "Core Banking Engine", "unexpected name");
    assert(coreBanking.defaultTier === 1, "tier 1 expected");
  });

  // 2. Create Application from Library via Wizard Step 1
  await test("POST /api/itdr/bia/applications initializes application from library", async () => {
    const res = await http(port, "/api/itdr/bia/applications", {
      method: "POST",
      sid: adminSid,
      body: {
        biaApplicationId: "app-core-banking",
        name: "Core Banking Engine",
        tier: 1,
        applicationType: "custom_built",
        primaryOwnerUserId: "user-plan_owner",
        backupOwnerUserId: "user-admin",
        processName: "Core Settlement",
        hosting: [
          { environmentId: "env-prod", siteId: "site-mum-dc01", role: "primary" },
          { environmentId: "env-dr", siteId: "site-chn-dc02", role: "secondary" },
        ],
        assets: [
          { name: "Oracle RAC Cluster", assetId: "ci-ora-cbs-01", type: "datastore", environment: "prod", criticality: "high" },
        ],
      },
    });
    assert(res.status === 201, `expected 201, got ${res.status}`);
    assert(res.data.name === "Core Banking Engine", "application name mismatch");
    assert(res.data.tier === 1, "tier mismatch");
    assert(res.data.hosting.length === 2, "expected 2 hosting rows");
  });

  // 3. Landing page coverage with live computed summary cards
  await test("GET /api/itdr/coverage returns merged dashboard summary and enriched plan rows", async () => {
    const res = await http(port, "/api/itdr/coverage", { sid: adminSid });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(res.data.summary, "summary missing");
    assert(typeof res.data.summary.totalApplications === "number", "totalApplications metric missing");
    assert(typeof res.data.summary.totalApplicationsWithPlan === "number", "totalApplicationsWithPlan missing");
    assert(typeof res.data.summary.applicationsWithoutPlan === "number", "applicationsWithoutPlan missing");
    assert(res.data.summary.plansByStatus, "plansByStatus missing");
    assert(res.data.summary.plansByTier, "plansByTier missing");
    assert(Array.isArray(res.data.rows), "rows array missing");

    const cbsRow = res.data.rows.find((r) => r.biaApplicationId === "app-core-banking");
    assert(cbsRow, "app-core-banking missing from rows");
    assert(cbsRow.name === "Core Banking Engine", "row missing name");
    assert(Array.isArray(cbsRow.hosting), "row hosting missing hosting array");
    assert(cbsRow.hosting[0]?.compositeLabel, "row hosting missing compositeLabel");
  });

  // 4. Hosting validation: Block duplicate Environment + Site combinations
  await test("Reject application update with duplicate (Environment, Site) pair", async () => {
    const res = await http(port, "/api/itdr/targets/app-core-banking", {
      method: "PATCH",
      sid: adminSid,
      body: {
        hosting: [
          { environmentId: "env-prod", siteId: "site-mum-dc01", role: "primary" },
          { environmentId: "env-prod", siteId: "site-mum-dc01", role: "secondary" }, // DUPLICATE
        ],
      },
    });
    assert(res.status === 400, `expected 400 for duplicate hosting, got ${res.status}`);
    assert(res.data.code === "EC-HOST-01", `expected EC-HOST-01, got ${res.data.code}`);
  });

  // 5. Hosting validation: Require at least one Production hosting row
  await test("Reject application update without a Production hosting row", async () => {
    const res = await http(port, "/api/itdr/targets/app-core-banking", {
      method: "PATCH",
      sid: adminSid,
      body: {
        hosting: [
          { environmentId: "env-dr", siteId: "site-chn-dc02", role: "secondary" },
          { environmentId: "env-uat", siteId: "site-blr-dc03", role: "none" },
        ],
      },
    });
    assert(res.status === 400, `expected 400 for missing production hosting, got ${res.status}`);
    assert(res.data.code === "EC-HOST-02", `expected EC-HOST-02, got ${res.data.code}`);
  });

  // 6. Valid multi-hosting setup with composite labels
  await test("Accept valid distinct hosting topologies and generate composite labels", async () => {
    const res = await http(port, "/api/itdr/targets/app-core-banking", {
      method: "PATCH",
      sid: adminSid,
      body: {
        hosting: [
          { environmentId: "env-prod", siteId: "site-mum-dc01", role: "primary" },
          { environmentId: "env-dr", siteId: "site-chn-dc02", role: "secondary" },
          { environmentId: "env-uat", siteId: "site-blr-dc03", role: "none" },
        ],
      },
    });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(res.data.hosting.length === 3, "expected 3 hosting rows");
    assert(res.data.hosting[0].compositeLabel.includes("Core Banking Engine | Production"), "composite label missing expected text");
    assert(res.data.hostingSummary === "Mumbai-DC-01 (Prod) -> Chennai-DC-02 (DR)", `unexpected hosting summary: ${res.data.hostingSummary}`);
  });

  // 7. Prod and DR same-site warning flag
  await test("Set warning indicator when Prod and DR share the same site", async () => {
    const res = await http(port, "/api/itdr/targets/app-core-banking", {
      method: "PATCH",
      sid: adminSid,
      body: {
        hosting: [
          { environmentId: "env-prod", siteId: "site-mum-dc01", role: "primary" },
          { environmentId: "env-dr", siteId: "site-mum-dc01", role: "secondary" }, // SAME SITE
        ],
      },
    });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(res.data.hostingWarning, "hostingWarning should be present");
    assert(res.data.hostingWarning.includes("same site"), "warning message should mention same site");
  });

  // 8. Create DR Plan for Application
  await test("Create master DR plan draft with RTO/RPO and steps", async () => {
    const res = await http(port, "/api/itdr/targets/app-core-banking/plan", {
      method: "POST",
      sid: planOwnerSid,
      body: {
        title: "Core Banking Engine Master Recovery Plan",
        strategy: "hot_site",
        claimedRtoMinutes: 45,
        claimedRpoMinutes: 5,
        steps: [
          { order: 1, title: "Isolate network segment", instruction: "Disable BGP route advertisement", ownerRole: "Network Lead", estimatedDurationMinutes: 10 },
          { order: 2, title: "Promote standby PostgreSQL", instruction: "Run failover playbook", ownerRole: "DBA Lead", estimatedDurationMinutes: 15 },
        ],
        contacts: [
          { role: "Incident Commander", name: "Ramesh Sharma", email: "ramesh@bank.com", phone: "+91-9876543210", contactType: "primary" },
        ],
      },
    });
    assert(res.status === 201, `expected 201 on new master plan creation, got ${res.status}`);
    assert(res.data.draft.title === "Core Banking Engine Master Recovery Plan", "draft title mismatch");
    assert(res.data.draft.claimedRtoMinutes === 45, "claimedRtoMinutes mismatch");
    assert(res.data.draft.claimedRpoMinutes === 5, "claimedRpoMinutes mismatch");
    assert(res.data.draft.steps.length === 2, "steps count mismatch");
  });

  // 9. Single Master DR Plan per application rule
  await test("Enforce one master plan per application (409 on duplicate draft creation)", async () => {
    const res = await http(port, "/api/itdr/targets/app-core-banking/plan", {
      method: "POST",
      sid: planOwnerSid,
      body: {
        title: "Another DR Plan for CBS",
        claimedRtoMinutes: 60,
        claimedRpoMinutes: 15,
      },
    });
    assert(res.status === 409, `expected 409 conflict for duplicate master plan draft, got ${res.status}`);
    assert(res.data.code === "EC-TGT-02" || res.data.code === "EC-DRP-DRAFT-EXISTS", `expected draft exists conflict, got ${res.data.code}`);
  });

  // 10. Delete draft DR plan endpoint
  await test("DELETE /api/itdr/targets/:id/plan deletes draft and allows recreating", async () => {
    const delRes = await http(port, "/api/itdr/targets/app-core-banking/plan", {
      method: "DELETE",
      sid: adminSid,
    });
    assert(delRes.status === 200, `expected 200 on delete, got ${delRes.status}`);
    assert(delRes.data.draft === null, "draft should be null after delete");

    // Recreate
    const createRes = await http(port, "/api/itdr/targets/app-core-banking/plan", {
      method: "POST",
      sid: planOwnerSid,
      body: {
        title: "Recreated CBS Master Plan",
        strategy: "cloud_dr",
        claimedRtoMinutes: 30,
        claimedRpoMinutes: 0,
      },
    });
    assert(createRes.status === 201, `expected 201 on recreated master plan, got ${createRes.status}`);
  });

  // 11. Merged plans endpoint
  await test("GET /api/itdr/plans returns list of master plans across applications", async () => {
    const res = await http(port, "/api/itdr/plans", { sid: adminSid });
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(Array.isArray(res.data.plans), "plans array missing");
    assert(res.data.plans.length > 0, "plans list should not be empty");

    const cbsPlan = res.data.plans.find((p) => p.biaApplicationId === "app-core-banking");
    assert(cbsPlan, "app-core-banking master plan missing from /api/itdr/plans");
    assert(cbsPlan.rto === "00:30", `expected RTO 00:30, got ${cbsPlan.rto}`);
    assert(cbsPlan.rpo === "00:00", `expected RPO 00:00, got ${cbsPlan.rpo}`);
  });

} finally {
  await new Promise((resolve) => server.close(resolve));
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
