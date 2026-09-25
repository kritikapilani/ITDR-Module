const ROLES = [
  { id: "ADMIN", label: "BCM Admin / DR Coordinator" },
  { id: "PLAN_OWNER", label: "Plan Owner" },
  { id: "APPROVER", label: "Reviewer / Approver" },
  { id: "AUDITOR", label: "Auditor" },
  { id: "EXECUTIVE", label: "Executive" },
  { id: "TEST_MANAGER", label: "Test Manager (Testing module — not ITDR)" },
  { id: "INCIDENT_COMMANDER", label: "Incident Commander (Crisis — not ITDR)" },
];

const state = { session: null };
const $ = (id) => document.getElementById(id);

function showBanner(message, kind = "error") {
  const el = $("banner");
  if (!message) {
    el.className = "banner hidden";
    el.textContent = "";
    return;
  }
  el.className = `banner${kind === "warn" ? " warn" : ""}`;
  el.textContent = message;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

async function ensureSession(role) {
  return api("/api/session", { method: "PUT", body: JSON.stringify({ role, tenantId: "tenant-demo" }) });
}

function statusPill(status) {
  return `<span class="pill st-${status}">${status || "unknown"}</span>`;
}

function mins(n) {
  return n == null ? "—" : `${n} min`;
}

const ASSET_TYPES = ["application", "infrastructure", "datastore", "network", "identity", "third_party"];
const ENVIRONMENTS = ["prod", "dr", "nonprod"];
const CRITICALITY = ["high", "medium", "low"];
const DEP_TYPES = ["depends_on", "replicates", "hosted_on"];
const ATTACH_KINDS = ["diagram", "config_backup", "vendor_sla"];
const STRATEGIES = ["hot_site", "warm_site", "cloud_dr", "backup_restore"];

function num(value) {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toIso(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function selectOptions(items, selected, emptyLabel) {
  const head = emptyLabel != null ? `<option value="">${emptyLabel}</option>` : "";
  return (
    head +
    items
      .map((item) => {
        const value = typeof item === "string" ? item : item.value;
        const label = typeof item === "string" ? item : item.label;
        return `<option value="${value}" ${String(value) === String(selected ?? "") ? "selected" : ""}>${label}</option>`;
      })
      .join("")
  );
}

function displayName(userId) {
  const user = (state.directory || []).find((u) => u.userId === userId);
  return user ? user.displayName : userId || "unassigned";
}

function otherModule(name, owner) {
  return `<article class="card other-module"><span class="pill">Existing BCM module</span>
    <h2 style="margin-top:10px">${name}</h2>
    <p class="muted">${owner} ITDR integrates with this module; it does not replace it.</p></article>`;
}

function renderOverview(status) {
  return `<div class="grid">
    <article class="card"><span class="pill">Phase 2</span>
      <h2 style="margin-top:10px">ITDR readiness</h2>
      <p class="muted">Ready is derived from an in-cycle DR Test of the <strong>current approved version</strong>. Testing owns the calendar. Crisis invocation is still deferred.</p></article>
    <article class="card"><h3>Session</h3>
      <p class="muted">${status.session?.displayName || ""} · ${status.session?.role}<br/>${(status.session?.permissions || []).join(", ")}</p></article>
    <article class="card"><h3>Out of this phase</h3>
      <p class="muted">No user-set ready flag, no ITDR scheduler, no Crisis invoke button. ISO pack is Phase 3.</p></article>
  </div>`;
}

function renderCoverage(data) {
  const kpi = data.kpi.percent == null ? "—" : `${data.kpi.percent}%`;
  const canAssign = ["ADMIN", "PLAN_OWNER"].includes(state.session?.role);
  const isAdmin = state.session?.role === "ADMIN";
  const appOptions = (data.rows || []).map((r) => ({ value: r.biaApplicationId, label: `${r.name} (${r.biaApplicationId})` }));
  const rows = data.rows
    .map(
      (r) => `<tr data-href="#target/${r.biaApplicationId}">
        <td>${r.name}${r.redacted ? " <span class='muted'>(restricted)</span>" : ""}</td>
        <td>${r.tier ?? "—"}</td>
        <td>${r.strategy || "<span class='muted'>required</span>"}</td>
        <td>${displayName(r.primaryOwnerUserId)}</td>
        <td>${displayName(r.backupOwnerUserId)}</td>
        <td>${mins(r.objectives?.inherited?.rtoMinutes)} / ${mins(r.objectives?.inherited?.rpoMinutes)}</td>
        <td>${statusPill(r.readiness?.status)}</td>
        <td>${(r.readiness?.gaps || []).join(", ") || "—"}</td>
      </tr>`
    )
    .join("");
  return `<div class="grid">
      <article class="card"><h3>Tier 1/2 approved, non-expired</h3>
        <div class="kpi">${kpi}</div>
        <p class="muted">${data.kpi.approvedNonExpired} of ${data.kpi.denominator} in-scope Tier 1/2 apps (population labelled). Tested-in-window is on the dashboard.</p></article>
      <article class="card"><h3>Counts by status</h3>
        <p class="muted">${Object.entries(data.countsByStatus).map(([k, v]) => `${k}: ${v}`).join(" · ") || "none"}</p>
        <p class="muted">Ready only after a bound passing DR Test.</p></article>
    </div>
    ${
      canAssign
        ? `<article class="card" style="margin-top:12px">
      <h2>Fill coverage fields</h2>
      <p class="muted">BIA identity, tier, and inherited RTO/RPO are read-only. Assign owners and strategy here, then open the application for assets, dependencies, overrides, and the runbook.</p>
      <form class="stack" id="coverage-assign">
        <div class="form-grid">
          <label><span class="req">Application</span>
            <select name="biaApplicationId" required>${selectOptions(appOptions, "", "Select application")}</select></label>
          ${
            isAdmin
              ? `<label><span class="req">Primary plan owner</span>
            <select name="primaryOwnerUserId">${ownerOptions("")}</select></label>
          <label><span class="req">Backup plan owner</span>
            <select name="backupOwnerUserId">${ownerOptions("")}</select></label>`
              : ""
          }
          <label><span class="req">Recovery strategy</span>
            <select name="strategy" required>
              ${selectOptions(STRATEGIES.map((s) => ({ value: s, label: s.replaceAll("_", " ") })), "", "Select strategy")}
            </select></label>
        </div>
        <button type="submit">Save coverage fields</button>
      </form>
    </article>`
        : ""
    }
    <article class="card" style="margin-top:12px">
      <h2>Coverage</h2>
      <p class="muted">Click a row to fill remaining recovery-target fields (assets, dependencies, RTO/RPO override, runbook).</p>
      <table class="clickable"><thead><tr><th>Application</th><th>Tier</th><th>Strategy</th><th>Primary owner</th><th>Backup owner</th><th>Inherited RTO/RPO</th><th>Status</th><th>Gaps</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="8" class="muted">No applications in BIA scope.</td></tr>`}</tbody></table>
    </article>`;
}

function renderApprovals(data) {
  const rows = data.items
    .map(
      (i) => `<tr>
        <td><a href="#target/${i.biaApplicationId}">${i.name}</a></td>
        <td>${i.title}</td>
        <td>${i.submittedBy}</td>
        <td>${i.submittedAt || ""}</td>
        <td><button data-approve="${i.versionId}">Approve</button>
            <button class="secondary" data-reject="${i.versionId}">Reject</button></td>
      </tr>`
    )
    .join("");
  return `<article class="card"><h2>In review</h2>
    <table><thead><tr><th>Application</th><th>Plan</th><th>Submitted by</th><th>When</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" class="muted">Nothing waiting.</td></tr>`}</tbody></table></article>`;
}

function renderTarget(t) {
  const r = t.readiness || {};
  const draft = t.draft;
  const approved = t.approved;
  const steps = (draft?.steps || [])
    .map(
      (s, i) => `<div class="step-card">
        <label><span class="req">Step ${s.order} instruction</span><textarea data-step="${i}" data-field="instruction" required>${s.instruction || ""}</textarea></label>
        <label>Prerequisite<textarea data-step="${i}" data-field="prerequisite">${s.prerequisite || ""}</textarea></label>
        <label>Rollback<textarea data-step="${i}" data-field="rollback">${s.rollback || ""}</textarea></label>
      </div>`
    )
    .join("");
  const contacts = (draft?.contacts || [])
    .map(
      (c, i) => `<div class="row">
        <input data-contact="${i}" data-field="role" value="${c.role || ""}" placeholder="Role" required />
        <input data-contact="${i}" data-field="name" value="${c.name || ""}" placeholder="Name" required />
        <input data-contact="${i}" data-field="email" value="${c.email || ""}" placeholder="Email" required />
      </div>`
    )
    .join("");
  const assets = t.assets
    .map((a) => `<tr><td>${a.assetId}</td><td>${a.name}</td><td>${a.type}</td><td>${a.environment}</td>
      <td>${a.criticality || "—"}</td><td>${displayName(a.ownerUserId)}</td><td>${a.recoveryNotes || "—"}</td>
      <td><button class="secondary" data-del-asset="${a.assetId}">Remove</button></td></tr>`)
    .join("");
  const deps = t.dependencies
    .map((d) => `<li>${d.fromAssetId} → ${d.toAssetId} <span class="muted">(${d.type || "depends_on"})</span></li>`)
    .join("");
  const processes = t.processes
    .map((p) => `<li><a href="#process/${p.processId}">${p.name}</a> (${p.processId}) RTO ${mins(p.rtoMinutes)} / RPO ${mins(p.rpoMinutes)}</li>`)
    .join("");
  const historyNote = approved
    ? `Current approved ${approved.versionId} by ${approved.approvedBy} at ${approved.approvedAt}`
    : "No approved version";
  const canWrite = ["ADMIN", "PLAN_OWNER"].includes(state.session?.role);
  return `
    <article class="card">
      <span class="pill">BIA ${t.biaApplicationId}</span> ${statusPill(r.status)}
      <h2>${t.name}</h2>
      <p class="muted">Tier ${t.tier ?? "—"} · Inherited RTO/RPO ${mins(t.objectives.inherited.rtoMinutes)} / ${mins(t.objectives.inherited.rpoMinutes)} (read-only from BIA).
        ${t.biaGap ? "<span class='warn-text'>BIA gap: no RTO/RPO.</span>" : ""}
        Drift: ${r.drift ? `${r.drift.kind}` : "none"}. Test: ${r.dimensions?.test ? "pass" : r.testEval?.reason || "unknown"} ${r.testEval?.exerciseMode ? `(${r.testEval.exerciseMode})` : ""}.</p>
      <p class="muted">BCP refs: ${(t.bcpPlans || []).map((p) => p.planId).join(", ") || "none (allowed)"} · ${historyNote}</p>
    </article>
    <div class="grid" style="margin-top:12px">
      <article class="card">
        <h3>Owners and strategy</h3>
        <form class="stack" id="meta-form">
          <label><span class="req">Primary owner</span>
            <select name="primaryOwnerUserId">${ownerOptions(t.primaryOwnerUserId)}</select></label>
          <label><span class="req">Backup owner</span>
            <select name="backupOwnerUserId">${ownerOptions(t.backupOwnerUserId)}</select></label>
          <label><span class="req">Strategy</span>
            <select name="strategy" required>
              ${selectOptions(STRATEGIES.map((s) => ({ value: s, label: s.replaceAll("_", " ") })), t.strategy, "(required before submit)")}
            </select></label>
          <button type="submit">Save assignment</button>
        </form>
        <div class="row"><button class="secondary" id="ack">Acknowledge assignment</button></div>
      </article>
      <article class="card">
        <h3>RTO/RPO override (FR-4)</h3>
        <p class="muted">Does not write back to BIA. Justification required.</p>
        <form class="stack" id="override-form">
          <label>Override RTO minutes <input name="rtoOverrideMinutes" type="number" min="0" value="${t.rtoOverrideMinutes ?? ""}" /></label>
          <label>Override RPO minutes <input name="rpoOverrideMinutes" type="number" min="0" value="${t.rpoOverrideMinutes ?? ""}" /></label>
          <label><span class="req">Justification</span> <input name="overrideReason" required placeholder="Reason required when overriding" /></label>
          <button type="submit">Save override</button>
        </form>
      </article>
    </div>
    <article class="card" style="margin-top:12px">
      <h3>BIA processes (display only)</h3>
      <ul>${processes || "<li class='muted'>No process mapping — BIA gap</li>"}</ul>
    </article>
    <article class="card" style="margin-top:12px">
      <h3>Assets and dependencies</h3>
      <table><thead><tr><th>Id</th><th>Name</th><th>Type</th><th>Env</th><th>Criticality</th><th>Owner</th><th>Recovery notes</th><th></th></tr></thead>
      <tbody>${
        assets || `<tr><td colspan="8" class="muted">No extra assets yet. The application node is present by default after seed.</td></tr>`
      }</tbody></table>
      <form class="stack" id="asset-form" style="margin-top:8px">
        <p class="muted">Every field below is stored on the recovery target (FR-1 / FR-2).</p>
        <div class="form-grid">
          <label><span class="req">Asset name</span> <input name="name" required placeholder="e.g. Payments DB" /></label>
          <label>Asset id <input name="assetId" placeholder="optional stable id" /></label>
          <label><span class="req">Type</span>
            <select name="type" required>${selectOptions(ASSET_TYPES, "infrastructure")}</select></label>
          <label><span class="req">Environment</span>
            <select name="environment" required>${selectOptions(ENVIRONMENTS, "prod")}</select></label>
          <label><span class="req">Criticality</span>
            <select name="criticality" required>${selectOptions(CRITICALITY, "medium")}</select></label>
          <label>Technical owner
            <select name="ownerUserId">${ownerOptions("")}</select></label>
        </div>
        <label>Recovery notes <textarea name="recoveryNotes" placeholder="Failover path, restore job, vendor contact…"></textarea></label>
        <button type="submit">Add asset</button>
      </form>
      <p class="muted">Recovery order (from → to). Type describes the edge.</p>
      <ul>${deps || "<li class='muted'>No extra edges. Application node is present by default.</li>"}</ul>
      <form class="stack" id="dep-form">
        <div class="form-grid">
          <label><span class="req">From asset</span>
            <select name="fromAssetId" required>${selectOptions((t.assets || []).map((a) => ({ value: a.assetId, label: `${a.name} (${a.assetId})` })), "", "Select asset")}</select></label>
          <label><span class="req">To asset</span>
            <select name="toAssetId" required>${selectOptions((t.assets || []).map((a) => ({ value: a.assetId, label: `${a.name} (${a.assetId})` })), "", "Select asset")}</select></label>
          <label>Dependency type
            <select name="type">${selectOptions(DEP_TYPES, "depends_on")}</select></label>
        </div>
        <button type="submit">Add edge</button>
      </form>
    </article>
    <article class="card" style="margin-top:12px">
      <h3>Runbook ${draft ? `(${draft.status} ${draft.versionId})` : ""}</h3>
      ${
        !draft
          ? `<div class="row"><button id="create-draft">Create draft from tier template</button>
             ${approved ? `<button class="secondary" id="clone-draft">New draft from approved (re-approval required)</button>` : ""}</div>`
          : `<form class="stack" id="plan-form">
              <input type="hidden" name="etag" value="${draft.etag}" />
              <div class="form-grid">
                <label><span class="req">Title</span> <input name="title" required value="${draft.title || ""}" /></label>
                <label>Claimed RTO minutes <input name="claimedRtoMinutes" type="number" min="0" value="${draft.claimedRtoMinutes ?? ""}" /></label>
                <label>Claimed RPO minutes <input name="claimedRpoMinutes" type="number" min="0" value="${draft.claimedRpoMinutes ?? ""}" /></label>
              </div>
              <div id="steps-list">${steps}</div>
              <div class="row"><button type="button" class="secondary" id="add-step">Add recovery step</button></div>
              <h3>Contacts</h3>
              <div id="contacts-list">${contacts}</div>
              <div class="row"><button type="button" class="secondary" id="add-contact">Add contact</button></div>
              <p class="muted">Attachments are supplements, not the plan.</p>
              <div class="form-grid">
                <label><span class="req">File name</span> <input name="fileName" placeholder="network-diagram.png" /></label>
                <label>Kind <select name="attachKind">${selectOptions(ATTACH_KINDS, "diagram")}</select></label>
                <label>Note <input name="attachNote" placeholder="optional description" /></label>
              </div>
              <div class="row">
                <button type="button" id="add-att">Attach metadata</button>
              </div>
              <ul>${(draft.attachments || []).map((a) => `<li>${a.fileName} (${a.kind})</li>`).join("")}</ul>
              <div class="row">
                <button type="submit">Save draft</button>
                ${draft.status === "draft" ? `<button type="button" id="submit-plan">Submit for approval</button>` : ""}
                ${draft.status === "in_review" ? `<button type="button" class="secondary" id="withdraw-plan">Withdraw to edit</button>` : ""}
              </div>
            </form>`
      }
      ${!canWrite ? `<p class="muted">Read-only for this persona.</p>` : ""}
    </article>
    <article class="card" style="margin-top:12px">
      <h3>DR Test history</h3>
      <p class="muted">Results are recorded in Testing. ITDR does not schedule them. <a href="#testing">Open Testing module</a></p>
      <table><thead><tr><th>Test</th><th>Type</th><th>Version</th><th>Outcome</th><th>Mode</th><th>Actual RTO/RPO</th><th>When</th></tr></thead>
      <tbody>${
        (t.tests || [])
          .map(
            (x) => `<tr><td>${x.testId}</td><td>${x.testType}</td><td>${x.planVersionId || "unbound"}</td>
            <td>${x.outcome || x.status}</td><td>${x.exerciseMode || "—"}</td>
            <td>${mins(x.actualRtoMinutes)} / ${mins(x.actualRpoMinutes)}</td><td>${x.completedAt || x.requestedAt || ""}</td></tr>`
          )
          .join("") || `<tr><td colspan="7" class="muted">No tests yet. Publishing a plan requests a DR Test in Testing.</td></tr>`
      }</tbody></table>
    </article>
    ${
      state.session?.role === "ADMIN"
        ? `<article class="card" style="margin-top:12px"><h3>Simulate BIA change (adapter)</h3>
           <p class="muted">Tightens live RTO to prove snapshot immutability and drift. Does not rewrite the approved runbook.</p>
           <button id="tighten-bia" class="secondary">Tighten live RTO</button>
           <button id="retire" class="secondary">Retire plan</button></article>`
        : ""
    }`;
}

function ownerOptions(selected) {
  const users = state.directory || [];
  return `<option value="">(none)</option>` + users.map((u) => `<option value="${u.userId}" ${u.userId === selected ? "selected" : ""}>${u.displayName}</option>`).join("");
}

function renderDashboard(data, filter) {
  const tiles = Object.values(data.kpis || {})
    .map(
      (k) => `<article class="card" data-tile="${k.id}" style="cursor:pointer">
        <h3>${k.label}</h3>
        <div class="kpi">${k.percent == null ? "—" : k.percent + "%"}</div>
        <p class="muted">${k.numerator} of ${k.denominator} · population ${k.population}</p>
      </article>`
    )
    .join("");
  let members = data.rows;
  if (filter && data.kpis[filter]) members = data.kpis[filter].members;
  const rows = members
    .map(
      (r) => `<tr data-href="#target/${r.biaApplicationId}">
        <td>${r.name || r.biaApplicationId}</td>
        <td>${statusPill(r.status || r.readiness?.status)}</td>
        <td>${r.evidence?.planVersionId || r.readiness?.evidence?.planVersionId || "—"}</td>
        <td>${r.evidence?.testId || r.readiness?.evidence?.testId || "—"}</td>
      </tr>`
    )
    .join("");
  return `<p class="muted">As of ${data.generatedAt} (UTC). Every tile drills to plan version + test evidence.</p>
    <div class="grid">${tiles}
      <article class="card"><h3>Open remediations</h3><p class="muted">${data.remediations.length} failed/unmet RTO</p></article>
      <article class="card"><h3>Overdue recertifications</h3><p class="muted">${data.overdueRecertifications.length}</p></article>
      <article class="card"><h3>BIA drift</h3><p class="muted">${data.biaDrift.length}</p></article>
    </div>
    <article class="card" style="margin-top:12px">
      <h2>${filter ? data.kpis[filter].label : "All in-scope applications"}</h2>
      <table class="clickable"><thead><tr><th>Application</th><th>Status</th><th>Plan version</th><th>Test</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="4" class="muted">None</td></tr>`}</tbody></table>
    </article>`;
}

function renderTesting(catalog, tests) {
  tests = tests || [];
  catalog = catalog || {};
  const types = catalog.types || [];
  const apps = catalog.applications || [];
  const users = catalog.users || state.directory || [];
  const modes = catalog.exerciseModes || ["tabletop", "simulation", "full_failover"];
  const outcomes = catalog.outcomes || ["pass", "fail", "partial"];
  const stepOutcomes = catalog.stepOutcomes || ["pass", "fail", "na"];
  const typeList = types.map((t) => `<li><strong>${t.code}</strong> — ${t.label}</li>`).join("");
  const appOptions = apps.map((a) => ({
    value: a.biaApplicationId,
    label: `${a.name} (${a.biaApplicationId})`,
  }));
  const userOptions = users.map((u) => ({ value: u.userId, label: `${u.displayName} (${u.role})` }));
  const versionOptions = [
    ...new Map(
      [
        ...apps.filter((a) => a.currentApprovedVersionId).map((a) => [a.currentApprovedVersionId, `${a.currentApprovedVersionId} — ${a.name}`]),
        ...tests.filter((t) => t.planVersionId).map((t) => [t.planVersionId, t.planVersionId]),
      ]
    ),
  ].map(([value, label]) => ({ value, label }));
  const openTests = tests.filter((t) => t.status !== "completed");
  const rows = tests
    .map(
      (t) => `<tr>
        <td>${t.testId}</td><td>${t.testType}</td><td>${t.targetBiaApplicationId || "—"}</td>
        <td>${t.planVersionId || "unbound"}</td>
        <td>${t.status}</td><td>${t.outcome || "—"}</td>
        <td>${t.exerciseMode || "—"}</td>
        <td>${mins(t.targetRtoMinutes)} / ${mins(t.targetRpoMinutes)}</td>
        <td>${mins(t.actualRtoMinutes)} / ${mins(t.actualRpoMinutes)}</td>
        <td>${t.testerUserId || "—"}</td>
      </tr>`
    )
    .join("");
  const stepRows = [0, 1, 2]
    .map(
      (i) => `<div class="row">
        <input name="stepId-${i}" placeholder="step id" />
        <select name="stepOutcome-${i}">${selectOptions(stepOutcomes.map((o) => ({ value: o, label: o })), "na", "Skip")}</select>
      </div>`
    )
    .join("");
  return `<article class="card">
      <span class="pill">Scheduler of record</span>
      <h2>Testing</h2>
      <p class="muted">ITDR does not own this calendar. Types registered in this module:</p>
      <ul>${typeList}</ul>
    </article>
    <article class="card" style="margin-top:12px">
      <h3>Records</h3>
      <table><thead><tr><th>Id</th><th>Type</th><th>Application</th><th>Plan version</th><th>Status</th><th>Outcome</th><th>Mode</th><th>Target RTO/RPO</th><th>Actual RTO/RPO</th><th>Tester</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="10" class="muted">No tests. Approve a DR plan to request a DR Test, or schedule below.</td></tr>`}</tbody></table>
    </article>
    <article class="card" style="margin-top:12px">
      <h3>Schedule a test</h3>
      <p class="muted">All DR Test fields the Test Manager fills before the exercise. BCP Test does not require a plan version and does not count toward ITDR readiness.</p>
      <form class="stack" id="sched-form">
        <div class="form-grid">
          <label><span class="req">Test type</span>
            <select name="testType" required>${selectOptions(types.map((t) => ({ value: t.code, label: t.label })), "DR_TEST")}</select></label>
          <label><span class="req">Target application</span>
            <select name="targetBiaApplicationId" id="sched-app" required>${selectOptions(appOptions, "", "Select application")}</select></label>
          <label>Plan version id
            <input name="planVersionId" id="sched-version" list="sched-versions" placeholder="required for bound DR Test" />
            <datalist id="sched-versions">${versionOptions.map((o) => `<option value="${o.value}">${o.label}</option>`).join("")}</datalist>
          </label>
          <label>Test owner
            <select name="ownerUserId">${selectOptions(userOptions, "", "(none)")}</select></label>
          <label>Scheduled at <input name="scheduledAt" type="datetime-local" /></label>
          <label>Due at <input name="dueAt" type="datetime-local" /></label>
          <label>Target RTO minutes <input name="targetRtoMinutes" type="number" min="0" /></label>
          <label>Target RPO minutes <input name="targetRpoMinutes" type="number" min="0" /></label>
        </div>
        <button type="submit">Schedule test</button>
      </form>
    </article>
    <article class="card" style="margin-top:12px">
      <h3>Record result</h3>
      <p class="muted">FR-16 fields: outcome, actual vs target RTO/RPO, exercise mode, and runbook step pass/fail. Ready is derived in ITDR — do not set it here.</p>
      <form class="stack" id="result-form">
        <div class="form-grid">
          <label><span class="req">Open test</span>
            <select name="testId" id="result-test" required>${selectOptions(
              openTests.map((t) => ({ value: t.testId, label: `${t.testId} · ${t.testType} · ${t.targetBiaApplicationId || "no app"}` })),
              "",
              openTests.length ? "Select test" : "No open tests"
            )}</select></label>
          <label><span class="req">Outcome</span>
            <select name="outcome" required>${selectOptions(outcomes.map((o) => ({ value: o, label: o })), "pass")}</select></label>
          <label><span class="req">Exercise mode</span>
            <select name="exerciseMode" required>${selectOptions(modes.map((m) => ({ value: m, label: m.replaceAll("_", " ") })), "tabletop")}</select></label>
          <label>Plan version id <input name="planVersionId" id="result-version" /></label>
          <label><span class="req">Actual RTO minutes</span> <input name="actualRtoMinutes" type="number" min="0" required /></label>
          <label><span class="req">Actual RPO minutes</span> <input name="actualRpoMinutes" type="number" min="0" required /></label>
          <label>Target RTO minutes <input name="targetRtoMinutes" type="number" min="0" /></label>
          <label>Target RPO minutes <input name="targetRpoMinutes" type="number" min="0" /></label>
          <label>Completed at <input name="completedAt" type="datetime-local" /></label>
          <label>Tester <select name="testerUserId">${selectOptions(userOptions, state.session?.userId || "", "(session user)")}</select></label>
          <label>Evidence reference <input name="evidenceRef" placeholder="ticket, share, or file id" /></label>
          <label>Result id <input name="resultId" placeholder="optional, for idempotent ingest" /></label>
        </div>
        <h3>Runbook step results</h3>
        <p class="muted">Step id from the tested version; outcome is pass, fail, or n/a.</p>
        <div id="step-results">${stepRows}</div>
        <div class="row"><button type="button" class="secondary" id="add-step-result">Add step result</button></div>
        <button type="submit">Save result</button>
      </form>
    </article>`;
}

function renderProcess(data) {
  const rows = data.applications
    .map(
      (a) => `<tr data-href="#target/${a.biaApplicationId}">
        <td>${a.name}</td><td>${statusPill(a.readiness.status)}</td>
        <td>${a.evidence?.planVersionId || "—"}</td><td>${a.evidence?.testId || "—"}</td>
      </tr>`
    )
    .join("");
  return `<article class="card">
    <h2>Process ${data.processId}</h2>
    <p class="muted">${data.note}</p>
    <table class="clickable"><thead><tr><th>Application</th><th>Status</th><th>Plan version</th><th>Test</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" class="muted">No mapped applications</td></tr>`}</tbody></table>
  </article>`;
}

function bindCoverage() {
  $("view").querySelectorAll("tr[data-href]").forEach((tr) => {
    tr.addEventListener("click", () => {
      location.hash = tr.getAttribute("data-href");
    });
  });
  $("coverage-assign")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const id = fd.get("biaApplicationId");
    const body = { strategy: fd.get("strategy") || null };
    if (state.session?.role === "ADMIN") {
      body.primaryOwnerUserId = fd.get("primaryOwnerUserId") || null;
      body.backupOwnerUserId = fd.get("backupOwnerUserId") || null;
    }
    await api(`/api/itdr/targets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
    await loadView();
  });
}

function collectPlan(form) {
  const steps = [];
  form.querySelectorAll("[data-step][data-field=instruction]").forEach((el) => {
    const i = Number(el.getAttribute("data-step"));
    steps[i] = steps[i] || { order: i + 1 };
    steps[i].instruction = el.value;
  });
  form.querySelectorAll("[data-step][data-field=prerequisite]").forEach((el) => {
    const i = Number(el.getAttribute("data-step"));
    steps[i] = steps[i] || { order: i + 1 };
    steps[i].prerequisite = el.value;
  });
  form.querySelectorAll("[data-step][data-field=rollback]").forEach((el) => {
    const i = Number(el.getAttribute("data-step"));
    steps[i] = steps[i] || { order: i + 1 };
    steps[i].rollback = el.value;
  });
  const contacts = [];
  form.querySelectorAll("[data-contact][data-field=role]").forEach((el) => {
    const i = Number(el.getAttribute("data-contact"));
    contacts[i] = contacts[i] || {};
    contacts[i].role = el.value;
  });
  form.querySelectorAll("[data-contact][data-field=name]").forEach((el) => {
    const i = Number(el.getAttribute("data-contact"));
    contacts[i] = contacts[i] || {};
    contacts[i].name = el.value;
  });
  form.querySelectorAll("[data-contact][data-field=email]").forEach((el) => {
    const i = Number(el.getAttribute("data-contact"));
    contacts[i] = contacts[i] || {};
    contacts[i].email = el.value;
  });
  return {
    etag: Number(form.etag.value),
    title: form.title.value,
    claimedRtoMinutes: form.claimedRtoMinutes.value ? Number(form.claimedRtoMinutes.value) : undefined,
    claimedRpoMinutes: form.claimedRpoMinutes.value ? Number(form.claimedRpoMinutes.value) : undefined,
    steps,
    contacts,
  };
}

async function bindTarget(t) {
  const id = t.biaApplicationId;
  $("meta-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api(`/api/itdr/targets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        primaryOwnerUserId: fd.get("primaryOwnerUserId") || null,
        backupOwnerUserId: fd.get("backupOwnerUserId") || null,
        strategy: fd.get("strategy") || null,
      }),
    });
    await loadView();
  });
  $("override-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api(`/api/itdr/targets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        rtoOverrideMinutes: fd.get("rtoOverrideMinutes") ? Number(fd.get("rtoOverrideMinutes")) : undefined,
        rpoOverrideMinutes: fd.get("rpoOverrideMinutes") ? Number(fd.get("rpoOverrideMinutes")) : undefined,
        overrideReason: fd.get("overrideReason"),
      }),
    });
    await loadView();
  });
  $("ack")?.addEventListener("click", async () => {
    await api(`/api/itdr/targets/${id}/ack`, { method: "POST", body: "{}" });
    await loadView();
  });
  $("asset-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api(`/api/itdr/targets/${id}/assets`, {
      method: "POST",
      body: JSON.stringify({
        name: fd.get("name"),
        assetId: fd.get("assetId") || undefined,
        type: fd.get("type"),
        environment: fd.get("environment"),
        criticality: fd.get("criticality"),
        ownerUserId: fd.get("ownerUserId") || null,
        recoveryNotes: fd.get("recoveryNotes") || null,
      }),
    });
    await loadView();
  });
  $("dep-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await api(`/api/itdr/targets/${id}/dependencies`, {
      method: "POST",
      body: JSON.stringify({
        fromAssetId: fd.get("fromAssetId"),
        toAssetId: fd.get("toAssetId"),
        type: fd.get("type") || "depends_on",
      }),
    });
    await loadView();
  });
  $("view").querySelectorAll("[data-del-asset]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api(`/api/itdr/targets/${id}/assets/${btn.getAttribute("data-del-asset")}`, { method: "DELETE" });
      await loadView();
    });
  });
  $("create-draft")?.addEventListener("click", async () => {
    await api(`/api/itdr/targets/${id}/plan`, { method: "POST", body: "{}" });
    await loadView();
  });
  $("clone-draft")?.addEventListener("click", async () => {
    await api(`/api/itdr/targets/${id}/new-draft`, { method: "POST", body: "{}" });
    await loadView();
  });
  const form = $("plan-form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await api(`/api/itdr/versions/${t.draft.versionId}`, { method: "PATCH", body: JSON.stringify(collectPlan(form)) });
    await loadView();
  });
  $("add-att")?.addEventListener("click", async () => {
    const fileName = form.fileName.value;
    if (!fileName) {
      showBanner("File name is required for an attachment");
      return;
    }
    await api(`/api/itdr/versions/${t.draft.versionId}`, {
      method: "PATCH",
      body: JSON.stringify({ etag: Number(form.etag.value), attachmentsAdd: [{ fileName, kind: form.attachKind.value || "diagram", note: form.attachNote?.value || "" }] }),
    });
    await loadView();
  });
  $("add-step")?.addEventListener("click", () => {
    const list = $("steps-list");
    const i = list.querySelectorAll("[data-step][data-field=instruction]").length;
    const card = document.createElement("div");
    card.className = "step-card";
    card.innerHTML = `<label><span class="req">Step ${i + 1} instruction</span><textarea data-step="${i}" data-field="instruction" required></textarea></label>
        <label>Prerequisite<textarea data-step="${i}" data-field="prerequisite"></textarea></label>
        <label>Rollback<textarea data-step="${i}" data-field="rollback"></textarea></label>`;
    list.appendChild(card);
  });
  $("add-contact")?.addEventListener("click", () => {
    const list = $("contacts-list");
    const i = list.querySelectorAll("[data-contact][data-field=role]").length;
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<input data-contact="${i}" data-field="role" placeholder="Role" required />
        <input data-contact="${i}" data-field="name" placeholder="Name" required />
        <input data-contact="${i}" data-field="email" placeholder="Email" required />`;
    list.appendChild(row);
  });
  $("submit-plan")?.addEventListener("click", async () => {
    await api(`/api/itdr/versions/${t.draft.versionId}`, { method: "PATCH", body: JSON.stringify(collectPlan(form)) });
    const result = await api(`/api/itdr/versions/${t.draft.versionId}/submit`, { method: "POST", body: "{}" });
    if (result.warnings?.length) showBanner(result.warnings.join(" "), "warn");
    await loadView();
  });
  $("withdraw-plan")?.addEventListener("click", async () => {
    await api(`/api/itdr/versions/${t.draft.versionId}/withdraw`, { method: "POST", body: "{}" });
    await loadView();
  });
  $("tighten-bia")?.addEventListener("click", async () => {
    const current = t.objectives.inherited.rtoMinutes || 120;
    await api(`/api/itdr/bia/applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        processes: (t.processes || []).map((p) => ({ ...p, rtoMinutes: Math.max(15, Math.floor((p.rtoMinutes || current) / 2)) })),
      }),
    });
    await loadView();
  });
  $("retire")?.addEventListener("click", async () => {
    await api(`/api/itdr/targets/${id}/retire`, { method: "POST", body: "{}" });
    await loadView();
  });
}

async function loadView() {
  const raw = (location.hash || "#coverage").slice(1);
  const [page, id] = raw.split("/");
  document.querySelectorAll(".nav-item").forEach((el) => {
    const href = (el.getAttribute("href") || "").slice(1);
    el.classList.toggle("active", href === page || (page === "itdr" && href === "coverage"));
  });
  const titles = {
    bia: ["Business Impact Analysis", "Existing module — not owned by ITDR"],
    bcp: ["Business Continuity Planning", "Existing module — not owned by ITDR"],
    crisis: ["Crisis Management", "Invocation deferred; DR data is linkage-compatible"],
    testing: ["Testing", "Fill DR Test schedule and result fields — scheduler of record"],
    coverage: ["ITDR coverage", "Fill owners and strategy; open an application for assets, dependencies, and the runbook"],
    itdr: ["ITDR coverage", "BIA applications vs plan and test status"],
    dashboard: ["Readiness dashboard", "Tier 1/2 population · drill to plan version and test"],
    process: ["Process mapping", "Process has no DR plan; applications do"],
    approvals: ["Approval inbox", "Segregation of duties: author cannot approve"],
    overview: ["ITDR overview", "Phase 2 tests and derived ready"],
    decisions: ["Sprint 0 decisions", "Still in force for Phase 1"],
    audit: ["Audit trail", "Approvals, overrides, and assignment"],
    target: ["Recovery target", "Inherited BIA objectives, runbook, versions"],
  };
  const [title, sub] = titles[page] || titles.coverage;
  $("page-title").textContent = title;
  $("page-sub").textContent = sub;

  if (["bia", "bcp", "crisis"].includes(page)) {
    showBanner("");
    const copy = {
      bia: otherModule("Business Impact Analysis", "BIA is authoritative for RTO/RPO and process mapping."),
      bcp: otherModule("Business Continuity Planning", "BCP owns business-side plans. ITDR stores a read-only plan id."),
      crisis: otherModule("Crisis Management", "No invoke control in ITDR (D6/D7)."),
    };
    $("view").innerHTML = copy[page];
    return;
  }

  try {
    if (page === "overview") {
      const status = await api("/api/itdr/status");
      showBanner("");
      $("view").innerHTML = renderOverview(status);
      return;
    }
    if (page === "decisions") {
      const data = await api("/api/itdr/decisions");
      showBanner("");
      $("view").innerHTML = `<article class="card"><pre>${JSON.stringify(data, null, 2)}</pre></article>`;
      return;
    }
    if (page === "audit") {
      const data = await api("/api/itdr/audit");
      const rows = (data.entries || [])
        .slice(0, 50)
        .map((e) => `<tr><td>${e.at}</td><td>${e.actor}</td><td>${e.action}</td><td>${JSON.stringify(e.detail || {})}</td></tr>`)
        .join("");
      showBanner("");
      $("view").innerHTML = `<article class="card"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></article>`;
      return;
    }
    if (page === "testing") {
      let catalog;
      try {
        catalog = await api("/api/testing/options");
      } catch {
        const types = await api("/api/testing/types");
        catalog = {
          types: types.types,
          exerciseModes: ["tabletop", "simulation", "full_failover"],
          outcomes: ["pass", "fail", "partial"],
          stepOutcomes: ["pass", "fail", "na"],
          applications: [
            { biaApplicationId: "bia-app-payments", name: "Payments Gateway", targetRtoMinutes: 120, targetRpoMinutes: 5 },
            { biaApplicationId: "bia-app-hr", name: "HR Portal", targetRtoMinutes: 1440, targetRpoMinutes: 60 },
            { biaApplicationId: "bia-app-wiki", name: "Internal Wiki" },
          ],
          users: [
            { userId: "user-admin", displayName: "Jordan Admin", role: "ADMIN" },
            { userId: "user-plan_owner", displayName: "Alex Owner", role: "PLAN_OWNER" },
            { userId: "user-test_manager", displayName: "Taylor Test Manager", role: "TEST_MANAGER" },
          ],
        };
      }
      const tests = await api("/api/testing/tests");
      showBanner("");
      $("view").innerHTML = renderTesting(catalog, tests.items);
      const appsById = Object.fromEntries((catalog.applications || []).map((a) => [a.biaApplicationId, a]));
      $("sched-app")?.addEventListener("change", (e) => {
        const app = appsById[e.target.value];
        if (!app) return;
        const form = $("sched-form");
        if (app.currentApprovedVersionId && !form.planVersionId.value) form.planVersionId.value = app.currentApprovedVersionId;
        if (app.targetRtoMinutes != null && !form.targetRtoMinutes.value) form.targetRtoMinutes.value = app.targetRtoMinutes;
        if (app.targetRpoMinutes != null && !form.targetRpoMinutes.value) form.targetRpoMinutes.value = app.targetRpoMinutes;
      });
      $("sched-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        await api("/api/testing/tests", {
          method: "POST",
          body: JSON.stringify({
            testType: fd.get("testType") || "DR_TEST",
            planVersionId: fd.get("planVersionId") || undefined,
            targetBiaApplicationId: fd.get("targetBiaApplicationId") || undefined,
            ownerUserId: fd.get("ownerUserId") || undefined,
            scheduledAt: toIso(fd.get("scheduledAt")),
            dueAt: toIso(fd.get("dueAt")),
            targetRtoMinutes: num(fd.get("targetRtoMinutes")),
            targetRpoMinutes: num(fd.get("targetRpoMinutes")),
          }),
        });
        await loadView();
      });
      const testsById = Object.fromEntries((tests.items || []).map((t) => [t.testId, t]));
      $("result-test")?.addEventListener("change", (e) => {
        const test = testsById[e.target.value];
        const form = $("result-form");
        if (!test || !form) return;
        form.planVersionId.value = test.planVersionId || "";
        if (test.targetRtoMinutes != null) form.targetRtoMinutes.value = test.targetRtoMinutes;
        if (test.targetRpoMinutes != null) form.targetRpoMinutes.value = test.targetRpoMinutes;
        if (test.actualRtoMinutes != null) form.actualRtoMinutes.value = test.actualRtoMinutes;
        if (test.actualRpoMinutes != null) form.actualRpoMinutes.value = test.actualRpoMinutes;
        if (test.exerciseMode) form.exerciseMode.value = test.exerciseMode;
        if (test.completedAt) form.completedAt.value = toLocalInput(test.completedAt);
        if (test.evidenceRef) form.evidenceRef.value = test.evidenceRef;
        if (test.resultId) form.resultId.value = test.resultId;
      });
      $("add-step-result")?.addEventListener("click", () => {
        const list = $("step-results");
        const i = list.querySelectorAll("input[name^='stepId-']").length;
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `<input name="stepId-${i}" placeholder="step id" />
        <select name="stepOutcome-${i}">${selectOptions((catalog.stepOutcomes || ["pass", "fail", "na"]).map((o) => ({ value: o, label: o })), "na", "Skip")}</select>`;
        list.appendChild(row);
      });
      $("result-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const stepResults = [];
        for (const [key, value] of fd.entries()) {
          if (!key.startsWith("stepId-") || !value) continue;
          const i = key.slice("stepId-".length);
          const outcome = fd.get(`stepOutcome-${i}`);
          if (!outcome) continue;
          stepResults.push({ stepId: value, outcome });
        }
        const testId = fd.get("testId");
        await api(`/api/testing/tests/${testId}/complete`, {
          method: "POST",
          body: JSON.stringify({
            outcome: fd.get("outcome"),
            exerciseMode: fd.get("exerciseMode"),
            planVersionId: fd.get("planVersionId") || null,
            actualRtoMinutes: num(fd.get("actualRtoMinutes")),
            actualRpoMinutes: num(fd.get("actualRpoMinutes")),
            targetRtoMinutes: num(fd.get("targetRtoMinutes")),
            targetRpoMinutes: num(fd.get("targetRpoMinutes")),
            completedAt: toIso(fd.get("completedAt")),
            testerUserId: fd.get("testerUserId") || undefined,
            evidenceRef: fd.get("evidenceRef") || null,
            resultId: fd.get("resultId") || undefined,
            stepResults,
          }),
        });
        await loadView();
      });
      return;
    }
    if (page === "dashboard") {
      const data = await api("/api/itdr/dashboard");
      showBanner("");
      $("view").innerHTML = renderDashboard(data, id);
      $("view").querySelectorAll("[data-tile]").forEach((el) => {
        el.addEventListener("click", () => {
          location.hash = `#dashboard/${el.getAttribute("data-tile")}`;
        });
      });
      bindCoverage();
      return;
    }
    if (page === "process" && id) {
      const data = await api(`/api/itdr/processes/${id}`);
      showBanner("");
      $("view").innerHTML = renderProcess(data);
      bindCoverage();
      return;
    }
    if (page === "approvals") {
      const data = await api("/api/itdr/approvals");
      showBanner("");
      $("view").innerHTML = renderApprovals(data);
      $("view").querySelectorAll("[data-approve]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await api(`/api/itdr/versions/${btn.getAttribute("data-approve")}/approve`, { method: "POST", body: "{}" });
          await loadView();
        });
      });
      $("view").querySelectorAll("[data-reject]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const comments = prompt("Review comments") || "";
          await api(`/api/itdr/versions/${btn.getAttribute("data-reject")}/reject`, { method: "POST", body: JSON.stringify({ comments }) });
          await loadView();
        });
      });
      return;
    }
    if (page === "target" && id) {
      if (!state.directory) state.directory = (await api("/api/itdr/directory")).users;
      const t = await api(`/api/itdr/targets/${id}`);
      showBanner(t.readiness?.drift ? `BIA drift (${t.readiness.drift.kind}) — approved runbook was not rewritten.` : "", "warn");
      $("view").innerHTML = renderTarget(t);
      await bindTarget(t);
      return;
    }
    const data = await api("/api/itdr/coverage");
    if (!state.directory) state.directory = (await api("/api/itdr/directory")).users;
    showBanner("");
    $("view").innerHTML = renderCoverage(data);
    bindCoverage();
  } catch (err) {
    showBanner(`${err.status || ""} ${err.message}`);
    $("view").innerHTML = `<div class="card empty">ITDR is not available for this persona, or the action was denied.</div>`;
  }
}

function syncItdrNav(enabled, hasAccess) {
  document.querySelectorAll(".itdr-only").forEach((el) => {
    el.classList.toggle("hidden", !(enabled && hasAccess));
  });
}

async function boot() {
  const select = $("role");
  select.innerHTML = ROLES.map((r) => `<option value="${r.id}">${r.label}</option>`).join("");
  let session = await api("/api/session");
  if (!session.role) session = await ensureSession("ADMIN");
  state.session = session;
  select.value = session.role;
  const flag = $("flag");
  flag.checked = true;
  flag.disabled = session.role !== "ADMIN";
  syncItdrNav(true, (session.permissions || []).includes("itdr.access"));
  select.addEventListener("change", async () => {
    state.session = await ensureSession(select.value);
    flag.disabled = state.session.role !== "ADMIN";
    syncItdrNav(flag.checked, (state.session.permissions || []).includes("itdr.access"));
    await loadView();
  });
  flag.addEventListener("change", async () => {
    try {
      await api("/api/itdr/flags", { method: "PUT", body: JSON.stringify({ itdrEnabled: flag.checked }) });
      syncItdrNav(flag.checked, (state.session.permissions || []).includes("itdr.access"));
      await loadView();
    } catch (err) {
      flag.checked = !flag.checked;
      showBanner(err.message);
    }
  });
  window.addEventListener("hashchange", loadView);
  await loadView();
}

boot().catch((err) => showBanner(err.message));
