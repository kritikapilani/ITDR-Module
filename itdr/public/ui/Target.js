import { e, useState, useEffect, api, Field, Select, UserSelect, Icon, Tabs, Crumb, minutesToHhmm, hhmmToMinutes, parseDuration, pretty, displayName, StatusPill, ChipInput, splitChips } from "./core.js";
import { PlanModal } from "./PlanModal.js";

function stepFrom(s, i) {
  return {
    stepId: s.stepId,
    order: s.order ?? i + 1,
    title: s.title || "",
    instruction: s.instruction || "",
    ownerRole: s.ownerRole || "",
    prerequisite: s.prerequisite || "",
    estimatedDurationMinutes: s.estimatedDurationMinutes ?? "",
    rollback: s.rollback || "",
    verification: s.verification || "",
  };
}

function contactFrom(c) {
  return {
    role: c.role || "",
    name: c.name || "",
    email: c.email || "",
    phone: c.phone || "",
    contactType: c.contactType || "primary",
    escalationOrder: c.escalationOrder ?? "",
  };
}

function formFromRecord(data) {
  const v = data.draft || data.approved;
  if (!v) return null;
  return {
    etag: v.etag,
    title: v.title || "",
    templateId: v.templateId || "",
    claimedRto: minutesToHhmm(v.claimedRtoMinutes),
    claimedRpo: minutesToHhmm(v.claimedRpoMinutes),
    steps: (v.steps || []).map(stepFrom),
    contacts: (v.contacts || []).map(contactFrom),
    primaryOwnerUserId: data.primaryOwnerUserId || "",
    backupOwnerUserId: data.backupOwnerUserId || "",
    strategy: data.strategy || v.strategy || "",
    primarySite: data.primarySite || "",
    recoverySite: data.recoverySite || "",
    backupFrequency: data.backupFrequency || "",
    backupRetentionValue: data.backupRetentionValue ?? "",
    backupRetentionUnit: data.backupRetentionUnit || "days",
    failoverMethod: data.failoverMethod || "",
  };
}

const CONTACT_KIND = {
  primary: { kind: "published", label: "Primary" },
  backup: { kind: "draft", label: "Backup" },
  escalation: { kind: "review", label: "Escalation" },
  vendor: { kind: "approved", label: "Vendor" },
};

const APP_TABS = [
  { id: "overview", label: "Overview" },
  { id: "infra", label: "Infrastructure & Dependencies" },
  { id: "plan", label: "DR Plan" },
];

const PLAN_TABS = [
  { id: "runbook", label: "Runbook" },
  { id: "posture", label: "RTO / RPO Posture" },
  { id: "strategy", label: "Recovery Strategy" },
  { id: "team", label: "Recovery Team & Contacts" },
  { id: "tests", label: "Test History" },
];

const PLAN_IDS = PLAN_TABS.map((t) => t.id);
const APP_IDS = APP_TABS.map((t) => t.id);
const ALL_PANES = [...APP_IDS, ...PLAN_IDS];

function planStatusOf(t, draft, approved, r) {
  const s = r?.status;
  if (s === "expired") return { kind: "expired", label: "Expired" };
  if (s === "failed_test") return { kind: "fail", label: "Fail" };
  if (draft?.status === "in_review") return { kind: "review", label: "In Review" };
  if (s === "ready") return { kind: "published", label: "Published" };
  if (approved) return { kind: "approved", label: "Approved" };
  if (draft?.status === "draft") return { kind: "draft", label: "Draft" };
  return { kind: "neutral", label: "—" };
}

function workflowOf(r, draft) {
  if (r?.status === "failed_test") return { kind: "fail", label: "FAIL" };
  if (r?.status === "expired") return { kind: "expired", label: "EXPIRED" };
  if (draft?.status === "in_review") return { kind: "review", label: "IN REVIEW" };
  if (r?.status === "ready") return { kind: "published", label: "READY" };
  return { kind: "progress", label: "IN PROGRESS" };
}

const HOSTING = {
  aws: "Cloud AWS",
  azure: "Cloud Azure",
  gcp: "Cloud GCP",
  on_prem: "On-prem",
  hybrid: "Hybrid",
  vendor_hosted: "SaaS Vendor",
};

function hostingLabel(value) {
  if (!value) return "Hosting unset";
  return HOSTING[value] || pretty(value);
}

function typeLabel(value) {
  if (!value) return "type unset";
  const map = { custom_built: "Custom-built", cots: "COTS", saas: "SaaS", legacy: "Legacy" };
  return map[value] || pretty(value);
}

function hhmm(m) {
  return minutesToHhmm(m) || "—";
}

function demoCell(value) {
  if (value == null) return e("span", { className: "not-tested" }, "not yet tested");
  return e("span", { className: "mono" }, hhmm(value));
}

function latestBoundTest(tests, versionId) {
  return (tests || [])
    .filter((x) => x.completedAt && x.planVersionId && (!versionId || x.planVersionId === versionId))
    .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)))[0] || null;
}

function worseThan(actual, target) {
  if (actual == null || target == null) return false;
  return Number(actual) > Number(target);
}

function drillDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function derivePosture({ requiredRto, requiredRpo, claimedRto, claimedRpo, demoRto, demoRpo }) {
  const tested = demoRto != null || demoRpo != null;
  const claimedGap = worseThan(claimedRto, requiredRto) || worseThan(claimedRpo, requiredRpo);
  if (!tested) {
    return claimedGap
      ? { id: "gap_unverified", kind: "gap-unverified", label: "GAP · UNVERIFIED" }
      : { id: "not_tested", kind: "not-tested", label: "NOT YET TESTED" };
  }
  if (worseThan(demoRto, requiredRto) || worseThan(demoRpo, requiredRpo)) {
    return { id: "gap_proven", kind: "gap-proven", label: "GAP · PROVEN BY TEST" };
  }
  if (!worseThan(demoRto, claimedRto) && !worseThan(demoRpo, claimedRpo)) {
    return { id: "aligned", kind: "aligned", label: "ALIGNED · VERIFIED" };
  }
  return { id: "gap_proven", kind: "gap-proven", label: "GAP · PROVEN BY TEST" };
}

export function Target({ id, tab, catalogs, users, session, onError, onWarn }) {
  const initial = tab && ALL_PANES.includes(tab) ? tab : "overview";
  const [t, setT] = useState(null);
  const [draftForm, setDraftForm] = useState(null);
  const [asset, setAsset] = useState({ name: "", assetId: "", type: "infrastructure", environment: "prod", criticality: "medium", ownerUserId: "", recoveryNotes: "" });
  const [dep, setDep] = useState({ fromAssetId: "", toAssetId: "", type: "depends_on" });
  const [att, setAtt] = useState({ fileName: "", kind: "diagram", note: "" });
  const [pane, setPane] = useState(initial);
  const [showPlan, setShowPlan] = useState(false);
  const [ovRto, setOvRto] = useState("");
  const [ovRpo, setOvRpo] = useState("");
  const [ovReason, setOvReason] = useState("");
  const [ovBusy, setOvBusy] = useState(false);
  const canWrite = ["ADMIN", "PLAN_OWNER"].includes(session?.role);
  const cat = catalogs || {};

  useEffect(() => {
    if (tab && ALL_PANES.includes(tab)) setPane(tab);
  }, [tab]);

  function goTab(next) {
    setPane(next);
    location.hash = `#target/${id}/${next}`;
  }

  function goOuter(next) {
    goTab(next);
  }

  async function load() {
    const data = await api(`/api/itdr/targets/${id}`);
    setT(data);
    setOvRto(minutesToHhmm(data.rtoOverrideMinutes));
    setOvRpo(minutesToHhmm(data.rpoOverrideMinutes));
    setOvReason(data.overrideReason || "");
    if (data.readiness?.drift) onWarn(`BIA drift (${data.readiness.drift.kind}) — approved runbook was not rewritten.`);
    else onWarn("");
    if (data.draft || data.approved) setDraftForm(formFromRecord(data));
    else setDraftForm(null);
  }

  useEffect(() => {
    load().catch((err) => onError(err.message));
  }, [id]);

  async function newDraftFromApproved() {
    try {
      await api(`/api/itdr/targets/${id}/new-draft`, { method: "POST", body: "{}" });
      await load();
      goTab("runbook");
    } catch (err) {
      onError(err.message);
    }
  }

  async function savePlan(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    if (!t.draft || t.draft.status !== "draft") {
      onError("Approved and published plans are locked. Create a new draft to edit.");
      return;
    }
    try {
      await api(`/api/itdr/versions/${t.draft.versionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          etag: draftForm.etag,
          title: draftForm.title,
          templateId: draftForm.templateId || undefined,
          strategy: draftForm.strategy || undefined,
          claimedRtoMinutes: hhmmToMinutes(draftForm.claimedRto),
          claimedRpoMinutes: hhmmToMinutes(draftForm.claimedRpo),
          steps: draftForm.steps,
          contacts: draftForm.contacts,
        }),
      });
      const targetPatch = {
        strategy: draftForm.strategy || null,
        primarySite: draftForm.primarySite,
        recoverySite: draftForm.recoverySite,
        backupFrequency: draftForm.backupFrequency || null,
        backupRetentionValue: draftForm.backupRetentionValue === "" ? null : Number(draftForm.backupRetentionValue),
        backupRetentionUnit: draftForm.backupRetentionUnit,
        failoverMethod: draftForm.failoverMethod || null,
      };
      if (session?.role === "ADMIN") {
        targetPatch.primaryOwnerUserId = draftForm.primaryOwnerUserId || null;
        targetPatch.backupOwnerUserId = draftForm.backupOwnerUserId || null;
      }
      await api(`/api/itdr/targets/${id}`, { method: "PATCH", body: JSON.stringify(targetPatch) });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  async function saveOverride(ev) {
    ev.preventDefault();
    const rto = parseDuration(ovRto);
    const rpo = parseDuration(ovRpo);
    const reason = String(ovReason || "").trim();
    setOvBusy(true);
    try {
      if (rto == null && rpo == null) {
        if (t.rtoOverrideMinutes == null && t.rpoOverrideMinutes == null) {
          throw new Error("Enter an IT-confirmed RTO or RPO override");
        }
        await api(`/api/itdr/targets/${id}`, { method: "PATCH", body: JSON.stringify({ clearOverride: true }) });
      } else {
        if (!reason) throw new Error("Override justification is required when an override is set");
        const body = { overrideReason: reason };
        if (rto != null) body.rtoOverrideMinutes = rto;
        if (rpo != null) body.rpoOverrideMinutes = rpo;
        await api(`/api/itdr/targets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      }
      if (draft && draft.status === "draft" && draftForm) {
        const nextRto = rto ?? t.rtoOverrideMinutes ?? requiredRto;
        const nextRpo = rpo ?? t.rpoOverrideMinutes ?? requiredRpo;
        await api(`/api/itdr/versions/${draft.versionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            etag: draftForm.etag,
            claimedRtoMinutes: nextRto,
            claimedRpoMinutes: nextRpo,
          }),
        });
      }
      await load();
    } catch (err) {
      onError(err.message);
    } finally {
      setOvBusy(false);
    }
  }

  if (!t) return e("p", { className: "muted" }, "Loading application…");
  const r = t.readiness || {};
  const draft = t.draft;
  const approved = t.approved;
  const record = draft || approved;
  const canEdit = canWrite && draft?.status === "draft";
  const isAdmin = session?.role === "ADMIN";
  const outer = APP_IDS.includes(pane) ? pane : "plan";
  const showAppChrome = APP_IDS.includes(pane);
  const show = (key) => pane === key;
  const inherited = t.objectives?.inherited || {};
  const boundVersionId = approved?.versionId || draft?.versionId;
  const latestTest = latestBoundTest(t.tests, boundVersionId);
  const requiredRto = inherited.rtoMinutes;
  const requiredRpo = inherited.rpoMinutes;
  const claimedRtoMin = t.rtoOverrideMinutes ?? hhmmToMinutes(draftForm?.claimedRto) ?? r.claimedObjectives?.rtoMinutes ?? requiredRto;
  const claimedRpoMin = t.rpoOverrideMinutes ?? hhmmToMinutes(draftForm?.claimedRpo) ?? r.claimedObjectives?.rpoMinutes ?? requiredRpo;
  const demoRto = latestTest?.actualRtoMinutes ?? null;
  const demoRpo = latestTest?.actualRpoMinutes ?? null;
  const rtoOverridden = t.rtoOverrideMinutes != null;
  const rpoOverridden = t.rpoOverrideMinutes != null;
  const posture = derivePosture({
    requiredRto,
    requiredRpo,
    claimedRto: claimedRtoMin,
    claimedRpo: claimedRpoMin,
    demoRto,
    demoRpo,
  });

  function setPlan(name, value) {
    setDraftForm((f) => ({ ...f, [name]: value }));
  }

  const createPlanActions = canWrite && !draft
    ? [
        e("button", { key: "create", type: "button", className: "accent", onClick: () => setShowPlan(true) }, e(Icon, { name: "add" }), "Create Plan"),
        approved && e("button", { key: "from", type: "button", className: "secondary", onClick: newDraftFromApproved }, "New draft from approved"),
      ]
    : [];
  const planSt = planStatusOf(t, draft, approved, r);
  const flow = workflowOf(r, draft);
  const planLockNote = !record
    ? null
    : draft?.status === "in_review"
      ? e("p", { className: "muted" }, "This version is in review and locked. Withdraw to edit, or wait for approval.")
      : !draft && approved
        ? e("p", { className: "muted" }, "This plan is approved or published. Create a new draft to change it — edits require re-approval.")
        : !canEdit
          ? e("p", { className: "muted" }, "Read-only for this persona.")
          : e("p", { className: "muted" }, "Same record as New DR Plan. Save to persist. Switching tabs keeps these values.");
  const planActions = e("div", { className: "actions" },
    canEdit && e("button", { type: "button", className: "secondary", onClick: () => savePlan() }, e(Icon, { name: "save" }), "Save"),
    canEdit && e("button", { type: "button", onClick: async () => {
      await savePlan();
      try {
        const result = await api(`/api/itdr/versions/${draft.versionId}/submit`, { method: "POST", body: "{}" });
        if (result.warnings?.length) onWarn(result.warnings.join(" "));
        await load();
      } catch (err) { onError(err.message); }
    } }, e(Icon, { name: "verified" }), "Submit for Approval"),
    draft?.status === "in_review" && canWrite && e("button", { type: "button", className: "secondary", onClick: async () => {
      try {
        await api(`/api/itdr/versions/${draft.versionId}/withdraw`, { method: "POST", body: "{}" });
        await load();
      } catch (err) { onError(err.message); }
    } }, "Withdraw"),
    canWrite && approved && !draft && e("button", { type: "button", className: "secondary", onClick: newDraftFromApproved }, "Edit (new draft)"),
    canWrite && !record && e("button", { type: "button", className: "accent", onClick: () => setShowPlan(true) }, e(Icon, { name: "add" }), "Create Plan")
  );
  const vendorChips = splitChips(t.vendorDependencies);

  function assetLabel(assetId) {
    const a = (t.assets || []).find((x) => x.assetId === assetId);
    return a ? `${a.name} (${a.assetId})` : assetId;
  }

  async function addAssetSubmit(ev) {
    ev.preventDefault();
    try {
      await api(`/api/itdr/targets/${id}/assets`, { method: "POST", body: JSON.stringify(asset) });
      setAsset({ name: "", assetId: "", type: "infrastructure", environment: "prod", criticality: "medium", ownerUserId: "", recoveryNotes: "" });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  async function addDepSubmit(ev) {
    ev.preventDefault();
    try {
      await api(`/api/itdr/targets/${id}/dependencies`, { method: "POST", body: JSON.stringify(dep) });
      setDep({ fromAssetId: "", toAssetId: "", type: "depends_on" });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  const header = e("div", { className: "detail-head-plain" },
    e(Crumb, { items: [
      { label: "Applications", href: "#coverage" },
      { label: `Tier ${t.tier ?? "—"}` },
      { label: t.biaApplicationId, mono: true },
    ] }),
    e("div", { className: "badge-row" },
      e(StatusPill, { kind: "tier", dot: false }, `Tier ${t.tier ?? "—"}`),
      e(StatusPill, { kind: flow.kind }, flow.label),
      e(StatusPill, { kind: planSt.kind }, planSt.label)
    ),
    e("div", { className: "list-head", style: { margin: "12px 0 0" } },
      e("div", null,
        e("div", { className: "detail-title" },
          e("h1", null, t.name),
          e("span", { className: "id-chip mono" }, t.biaApplicationId)
        ),
        e("p", { className: "sub" }, `${hostingLabel(t.hostingEnvironment)} Â· ${typeLabel(t.applicationType)}`)
      ),
      e("div", { className: "actions" },
        e("button", { type: "button", className: "secondary", onClick: () => goTab("runbook") }, e(Icon, { name: "description" }), "Open runbook"),
        e("button", { type: "button", className: "secondary", onClick: () => { location.hash = "#testing"; } }, e(Icon, { name: "bolt" }), "Open DR test")
      )
    ),
    e("div", { className: "info-band" },
      e("div", { className: "meta-item" }, e("span", { className: "meta-label" }, "Primary business owner"), e("strong", null, displayName(users, t.applicationOwnerUserId) || "unassigned")),
      e("div", { className: "meta-item" }, e("span", { className: "meta-label" }, "Technical DR custodian"), e("strong", null, displayName(users, t.primaryOwnerUserId) || "unassigned")),
      e("div", { className: "meta-item" }, e("span", { className: "meta-label" }, "Linked business process", e("span", { className: "source-tag" }, "from BIA")), e("strong", null, (t.processes || [])[0]?.name || "unset")),
      e("div", { className: "meta-item" }, e("span", { className: "meta-label" }, "Impact assessment ID", e("span", { className: "source-tag" }, "from BIA")), e("strong", { className: "mono" }, t.biaApplicationId))
    )
  );

  const biaCard = e("article", { className: "card", style: { marginTop: 16 } },
    e("h2", { className: "panel-title" }, e(Icon, { name: "assignment_turned_in" }), " Linked Business Impact Analysis (BIA)"),
    e("p", { className: "muted" }, "BIA owns process mapping and business RTO/RPO. ITDR inherits them; it does not re-key them."),
    e("div", { className: "posture-compact" },
      e("span", { className: "meta-label" }, "RTO / RPO posture"),
      e(StatusPill, { kind: posture.kind, dot: false }, posture.label),
      e("a", { href: `#target/${id}/posture` }, "View posture")
    ),
    e("div", { className: "stat-row" },
      e("div", { className: "stat-card" },
        e("div", { className: "metric-label" }, "Inherited RTO ", e("span", { className: "source-tag" }, "from BIA")),
        e("div", { className: "kpi mono" }, hhmm(inherited.rtoMinutes))
      ),
      e("div", { className: "stat-card" },
        e("div", { className: "metric-label" }, "Inherited RPO ", e("span", { className: "source-tag" }, "from BIA")),
        e("div", { className: "kpi mono" }, hhmm(inherited.rpoMinutes))
      ),
      e("div", { className: "stat-card" },
        e("div", { className: "metric-label" }, "Effective RTO", rtoOverridden ? e("span", { className: "source-tag" }, "override") : null),
        e("div", { className: "kpi mono" }, hhmm(t.objectives?.effectiveRtoMinutes))
      ),
      e("div", { className: "stat-card" },
        e("div", { className: "metric-label" }, "Effective RPO", rpoOverridden ? e("span", { className: "source-tag" }, "override") : null),
        e("div", { className: "kpi mono" }, hhmm(t.objectives?.effectiveRpoMinutes))
      )
    ),
    e("h3", { style: { marginTop: 20 } }, "BIA processes (inherited)"),
    e("ul", { className: "process-list" }, (t.processes || []).length
      ? t.processes.map((p) => e("li", { key: p.processId },
          e("a", { href: `#process/${p.processId}` }, p.name),
          e("span", { className: "mono muted" }, ` — RTO ${hhmm(p.rtoMinutes)} / RPO ${hhmm(p.rpoMinutes)}`)
        ))
      : e("li", { className: "muted" }, "No process mapping — BIA gap"))
  );

  const postureCard = e("article", { className: "card posture-card", style: { marginTop: 12 } },
    e("div", { className: "card-toolbar" },
      e("div", null,
        e("h2", { className: "posture-title" }, "RTO / RPO posture"),
        e("p", { className: "muted" }, "Comparison of what BIA requires, what this plan claims, and what the last bound DR test demonstrated. Status is derived — it is not a user-entered field.")
      ),
      e(StatusPill, { kind: posture.kind, dot: false }, posture.label)
    ),
    e("div", { className: "callout" },
      e(Icon, { name: "info" }),
      e("p", null, "Required comes from linked BIA process(es). Claimed is the value committed on this DR plan — it equals Required unless an IT override is justified below. Demonstrated comes only from the most recent DR Test result against this plan version. It stays empty until a test actually runs, and is never entered by hand.")
    ),
    e("table", { className: "posture-table" },
      e("thead", null, e("tr", null,
        e("th", null, ""),
        e("th", null, "Required (from BIA)"),
        e("th", null, "Claimed (this plan)"),
        e("th", null, "Demonstrated (last DR test)")
      )),
      e("tbody", null,
        e("tr", null,
          e("th", { scope: "row" }, "RTO"),
          e("td", { className: "mono" }, hhmm(requiredRto)),
          e("td", null,
            e("span", { className: `mono${rtoOverridden ? " claimed-override" : ""}` }, hhmm(claimedRtoMin)),
            rtoOverridden ? e("span", { className: "source-tag" }, "override") : null
          ),
          e("td", null, demoCell(demoRto))
        ),
        e("tr", null,
          e("th", { scope: "row" }, "RPO"),
          e("td", { className: "mono" }, hhmm(requiredRpo)),
          e("td", null,
            e("span", { className: `mono${rpoOverridden ? " claimed-override" : ""}` }, hhmm(claimedRpoMin)),
            rpoOverridden ? e("span", { className: "source-tag" }, "override") : null
          ),
          e("td", null, demoCell(demoRpo))
        )
      )
    ),
    demoRto != null || demoRpo != null
      ? e("p", { className: "posture-caption" },
          "Last drill: ",
          e("a", { href: `#testing/${latestTest.testId}`, className: "mono" }, drillDate(latestTest.completedAt) || latestTest.testId)
        )
      : e("p", { className: "posture-caption caution" }, "No DR test has been run against this plan yet — readiness cannot be verified until one is."),
    e("div", { className: "override-panel" },
      e("h3", null, "IT override (optional)"),
      e("p", { className: "muted" }, "Only use if the technically achievable RTO/RPO genuinely differs from what BIA requires. This replaces the Claimed value on this plan — it never writes back to BIA."),
      e("form", { className: "stack", onSubmit: saveOverride },
        e("div", { className: "form-grid two" },
          e(Field, { label: "IT-confirmed RTO override" }, e("input", {
            className: "mono",
            placeholder: hhmm(requiredRto) === "—" ? "hh:mm" : hhmm(requiredRto),
            readOnly: !canWrite,
            value: ovRto,
            onChange: (ev) => setOvRto(ev.target.value),
          })),
          e(Field, { label: "IT-confirmed RPO override" }, e("input", {
            className: "mono",
            placeholder: hhmm(requiredRpo) === "—" ? "hh:mm" : hhmm(requiredRpo),
            readOnly: !canWrite,
            value: ovRpo,
            onChange: (ev) => setOvRpo(ev.target.value),
          }))
        ),
        e(Field, { label: "Override justification", required: Boolean(ovRto || ovRpo) }, e("textarea", {
          rows: 3,
          readOnly: !canWrite,
          placeholder: "Required if either override is filled. Logged; never written back to BIA.",
          value: ovReason,
          onChange: (ev) => setOvReason(ev.target.value),
        })),
        canWrite
          ? e("div", { className: "row", style: { margin: 0 } },
              e("button", { type: "submit", disabled: ovBusy }, ovBusy ? "Saving…" : "Save override")
            )
          : e("p", { className: "muted" }, "Read-only for this persona.")
      )
    )
  );

  const strategyCard = e("article", { className: "card", style: { marginTop: 12 } },
    e("div", { className: "card-toolbar" },
      e("div", null,
        e("h2", { style: { margin: 0 } }, "Recovery strategy"),
        e("p", { className: "muted" }, "Pre-filled from plan creation. Same fields as New DR Plan.")
      ),
      planActions
    ),
    planLockNote,
    !record
      ? e("div", { className: "empty" }, e("p", null, "No plan yet. Create a DR Plan to capture recovery strategy."))
      : e("form", { className: "stack", onSubmit: savePlan },
          e("div", { className: "form-grid two" },
            e(Field, { label: "Recovery strategy type", required: true }, e(Select, {
              required: true, disabled: !canEdit, empty: "Select strategy",
              value: draftForm?.strategy || "",
              onChange: (ev) => setPlan("strategy", ev.target.value),
              options: cat.strategies || ["hot_site", "warm_site", "cold_site", "cloud_dr", "backup_restore"],
            })),
            e(Field, { label: "Failover method", required: true }, e(Select, {
              required: true, disabled: !canEdit, empty: "Select method",
              value: draftForm?.failoverMethod || "",
              onChange: (ev) => setPlan("failoverMethod", ev.target.value),
              options: cat.failoverMethods || ["manual", "automated", "semi_automated"],
            })),
            e(Field, { label: "Primary site / location", required: true }, e("input", {
              required: true, readOnly: !canEdit,
              value: draftForm?.primarySite || "",
              onChange: (ev) => setPlan("primarySite", ev.target.value),
            })),
            e(Field, { label: "Recovery site / location", required: true }, e("input", {
              required: true, readOnly: !canEdit,
              value: draftForm?.recoverySite || "",
              onChange: (ev) => setPlan("recoverySite", ev.target.value),
            })),
            e(Field, { label: "Backup frequency", required: true }, e(Select, {
              required: true, disabled: !canEdit, empty: "Select frequency",
              value: draftForm?.backupFrequency || "",
              onChange: (ev) => setPlan("backupFrequency", ev.target.value),
              options: cat.backupFrequencies || ["real_time", "hourly", "daily", "weekly"],
            })),
            e(Field, { label: "Backup retention", required: true },
              e("div", { className: "row", style: { margin: 0 } },
                e("input", { type: "number", min: "1", required: true, readOnly: !canEdit, value: draftForm?.backupRetentionValue ?? "", onChange: (ev) => setPlan("backupRetentionValue", ev.target.value) }),
                e(Select, { disabled: !canEdit, value: draftForm?.backupRetentionUnit || "days", onChange: (ev) => setPlan("backupRetentionUnit", ev.target.value), options: cat.retentionUnits || ["hours", "days", "weeks", "months"] })
              )
            )
          )
        )
  );

  const planSummary = e("article", { className: "card", style: { marginTop: 16 } },
    e("div", { className: "card-toolbar" },
      e("div", null,
        e("h2", { style: { margin: 0 } }, "DR Plan"),
        e("p", { className: "muted" }, "Plan status, version, and owner. Open the runbook to author steps.")
      ),
      e("div", { className: "actions" },
        ...createPlanActions,
        e("button", { type: "button", className: "secondary", onClick: () => goTab("runbook") }, e(Icon, { name: "description" }), "Open runbook")
      )
    ),
    e("div", { className: "info-band nested" },
      e("div", { className: "meta-item" }, e("span", { className: "meta-label" }, "Plan status"), e("strong", null, e(StatusPill, { kind: planSt.kind }, planSt.label))),
      e("div", { className: "meta-item" }, e("span", { className: "meta-label" }, "Version"), e("strong", { className: "mono" }, draft?.versionId || approved?.versionId || "—")),
      e("div", { className: "meta-item" }, e("span", { className: "meta-label" }, "Owner"), e("strong", null, displayName(users, t.primaryOwnerUserId) || "unassigned")),
      e("div", { className: "meta-item" }, e("span", { className: "meta-label" }, "Plan ID"), e("strong", { className: "mono" }, t.planId || "—"))
    ),
    e("h3", { style: { marginTop: 20 } }, "Infrastructure dependencies"),
    e("p", { className: "hint" }, "Read-only on the DR Plan. Add or change on Infrastructure & Dependencies."),
    e("table", { className: "list-table" },
      e("thead", null, e("tr", null, e("th", null, "Id"), e("th", null, "Name"), e("th", null, "Type"), e("th", null, "Env"), e("th", null, "Criticality"), e("th", null, "Owner"), e("th", null, "Recovery notes"))),
      e("tbody", null,
        (t.assets || []).length
          ? (t.assets || []).map((a) => e("tr", { key: a.assetId },
              e("td", { className: "mono" }, a.assetId || "—"),
              e("td", null, a.name || "—"),
              e("td", null, pretty(a.type) || "—"),
              e("td", null, pretty(a.environment) || "—"),
              e("td", null, pretty(a.criticality) || "—"),
              e("td", null, displayName(users, a.ownerUserId) || "—"),
              e("td", null, a.recoveryNotes || "—")
            ))
          : e("tr", null, e("td", { colSpan: 7, className: "muted" }, "No infrastructure recorded."))
      )
    ),
    e("h3", { style: { marginTop: 16 } }, "Recovery order"),
    e("ul", { className: "process-list" }, (t.dependencies || []).length
      ? (t.dependencies || []).map((d, i) => e("li", { key: i }, `${assetLabel(d.fromAssetId)} â†’ ${assetLabel(d.toAssetId)} (${pretty(d.type) || "depends on"})`))
      : e("li", { className: "muted" }, "No dependency edges.")),
    e("p", { className: "muted" }, `Vendor dependencies: ${t.vendorDependencies || "—"}`)
  );

  async function saveVendorChips(names) {
    try {
      await api(`/api/itdr/targets/${id}`, { method: "PATCH", body: JSON.stringify({ vendorDependencies: names.join(" | ") }) });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  return e(
    "div",
    { className: "list-page" },
    header,
    showAppChrome && e(Tabs, { items: APP_TABS, value: outer, onChange: goOuter }),
    !showAppChrome && e("div", { className: "row" },
      e("button", { type: "button", className: "secondary", onClick: () => goTab("plan") }, "Back to application"),
      e(Tabs, { items: PLAN_TABS, value: PLAN_IDS.includes(pane) ? pane : "runbook", onChange: goTab })
    ),
    show("overview") && biaCard,
    show("plan") && planSummary,
    show("infra") && e("article", { className: "card", style: { marginTop: 16 } },
      e("h2", { style: { marginTop: 0 } }, "Infrastructure Dependencies"),
      e("p", { className: "hint" }, "Entered per application (Phase 1) — not yet linked to a shared infrastructure registry"),
      e("table", { className: "list-table" },
        e("thead", null, e("tr", null,
          e("th", null, "Id"), e("th", null, "Name"), e("th", null, "Type"), e("th", null, "Env"),
          e("th", null, "Criticality"), e("th", null, "Owner"), e("th", null, "Recovery notes"), canWrite && e("th", null, "")
        )),
        e("tbody", null,
          (t.assets || []).length
            ? (t.assets || []).map((a) => e("tr", { key: a.assetId },
                e("td", { className: "mono" }, a.assetId || "—"),
                e("td", null, a.name || "—"),
                e("td", null, pretty(a.type) || "—"),
                e("td", null, pretty(a.environment) || "—"),
                e("td", null, pretty(a.criticality) || "—"),
                e("td", null, displayName(users, a.ownerUserId) || "—"),
                e("td", null, a.recoveryNotes || "—"),
                canWrite && e("td", null, e("button", {
                  type: "button",
                  className: "secondary",
                  onClick: async () => {
                    try {
                      await api(`/api/itdr/targets/${id}/assets/${a.assetId}`, { method: "DELETE" });
                      await load();
                    } catch (err) {
                      onError(err.message);
                    }
                  },
                }, "Remove"))
              ))
            : e("tr", null, e("td", { colSpan: canWrite ? 8 : 7, className: "muted" }, "No infrastructure recorded on this application."))
        )
      ),
      canWrite && e("form", { className: "stack", style: { marginTop: 16 }, onSubmit: addAssetSubmit },
        e("h3", null, "Add asset"),
        e("div", { className: "form-grid two" },
          e(Field, { label: "Asset name", required: true }, e("input", { required: true, value: asset.name, onChange: (ev) => setAsset({ ...asset, name: ev.target.value }), placeholder: "e.g. Payments DB" })),
          e(Field, { label: "Asset ID" }, e("input", { className: "mono", value: asset.assetId, onChange: (ev) => setAsset({ ...asset, assetId: ev.target.value }), placeholder: "optional stable id" })),
          e(Field, { label: "Type", required: true }, e(Select, { required: true, value: asset.type, onChange: (ev) => setAsset({ ...asset, type: ev.target.value }), options: cat.assetTypes || ["application", "infrastructure", "datastore", "network", "identity", "third_party"] })),
          e(Field, { label: "Environment", required: true }, e(Select, { required: true, value: asset.environment, onChange: (ev) => setAsset({ ...asset, environment: ev.target.value }), options: cat.environments || ["prod", "dr", "nonprod"] })),
          e(Field, { label: "Criticality", required: true }, e(Select, { required: true, value: asset.criticality, onChange: (ev) => setAsset({ ...asset, criticality: ev.target.value }), options: cat.criticality || ["high", "medium", "low"] })),
          e(Field, { label: "Technical owner" }, e(UserSelect, { users, empty: "(none)", value: asset.ownerUserId, onChange: (ev) => setAsset({ ...asset, ownerUserId: ev.target.value }) }))
        ),
        e(Field, { label: "Recovery notes" }, e("textarea", { value: asset.recoveryNotes, onChange: (ev) => setAsset({ ...asset, recoveryNotes: ev.target.value }), placeholder: "Failover path, restore job, vendor contact…" })),
        e("div", { className: "row" }, e("button", { type: "submit" }, "Add asset"))
      ),
      e("h3", { style: { marginTop: 24 } }, "Recovery order"),
      e("p", { className: "hint" }, "From â†’ to. Type describes the edge."),
      e("ul", { className: "process-list" }, (t.dependencies || []).length
        ? (t.dependencies || []).map((d, i) => e("li", { key: i },
            e("span", { className: "mono" }, assetLabel(d.fromAssetId)),
            " â†’ ",
            e("span", { className: "mono" }, assetLabel(d.toAssetId)),
            e("span", { className: "muted" }, ` (${pretty(d.type) || "depends on"})`)
          ))
        : e("li", { className: "muted" }, "No dependency edges.")),
      canWrite && e("form", { className: "stack", style: { marginTop: 12 }, onSubmit: addDepSubmit },
        e("div", { className: "form-grid two" },
          e(Field, { label: "From asset", required: true }, e(Select, {
            required: true,
            empty: "Select asset",
            value: dep.fromAssetId,
            onChange: (ev) => setDep({ ...dep, fromAssetId: ev.target.value }),
            options: (t.assets || []).map((a) => ({ value: a.assetId, label: `${a.name} (${a.assetId})` })),
          })),
          e(Field, { label: "To asset", required: true }, e(Select, {
            required: true,
            empty: "Select asset",
            value: dep.toAssetId,
            onChange: (ev) => setDep({ ...dep, toAssetId: ev.target.value }),
            options: (t.assets || []).map((a) => ({ value: a.assetId, label: `${a.name} (${a.assetId})` })),
          })),
          e(Field, { label: "Dependency type" }, e(Select, { value: dep.type, onChange: (ev) => setDep({ ...dep, type: ev.target.value }), options: cat.dependencyTypes || ["depends_on", "replicates", "hosted_on"] }))
        ),
        e("div", { className: "row" }, e("button", { type: "submit", className: "secondary" }, "Add edge"))
      ),
      e("h2", { style: { marginTop: 24 } }, "Vendor/Third-Party Dependencies"),
      e("p", { className: "hint" }, "Entered per application (Phase 1)"),
      vendorChips.length || canWrite
        ? (canWrite
          ? e(ChipInput, { values: vendorChips, onChange: saveVendorChips, placeholder: "Type a vendor and press Enter" })
          : e("div", { className: "chip-row" }, vendorChips.map((n) => e("span", { key: n, className: "tag-chip" }, n))))
        : e("p", { className: "unset" }, "—")
    ),
    show("posture") && postureCard,
    show("strategy") && strategyCard,
    show("runbook") && e("article", { className: "card", style: { marginTop: 12 } },
      e("div", { className: "card-toolbar" },
        e("div", null,
          e("h2", { style: { margin: 0 } }, "Disaster Recovery Runbook"),
          e("p", { className: "muted" }, "Plan header and execution steps from the saved plan record.")
        ),
        e("div", { className: "actions" },
          e("span", { className: "chip" }, `${(draftForm?.steps || record?.steps || []).length} STEPS`),
          planActions
        )
      ),
      planLockNote,
      !record
        ? e("div", { className: "empty" },
            e("p", { style: { marginTop: 0 } }, "No runbook yet. Create a DR Plan — steps entered there appear here."),
            !canWrite && e("p", { className: "muted" }, "Sign in as BCM Admin or an assigned Plan Owner to create a plan.")
          )
        : draftForm && e("form", { className: "stack", onSubmit: savePlan },
            e("div", { className: "form-grid two" },
              e(Field, { label: "Plan ID", hint: "System" }, e("input", { className: "mono", value: t.planId || "—", readOnly: true })),
              e(Field, { label: "Plan name", required: true }, e("input", { required: true, readOnly: !canEdit, value: draftForm.title, onChange: (ev) => setPlan("title", ev.target.value) })),
              e(Field, { label: "Linked application", hint: "System" }, e("input", { value: t.name, readOnly: true })),
              e(Field, { label: "Plan owner" }, isAdmin && canEdit
                ? e(UserSelect, { users, empty: "Select owner", value: draftForm.primaryOwnerUserId, onChange: (ev) => setPlan("primaryOwnerUserId", ev.target.value) })
                : e("input", { value: displayName(users, draftForm.primaryOwnerUserId) || "unassigned", readOnly: true })),
              e(Field, { label: "Backup plan owner" }, isAdmin && canEdit
                ? e(UserSelect, { users, empty: "(none)", value: draftForm.backupOwnerUserId, onChange: (ev) => setPlan("backupOwnerUserId", ev.target.value) })
                : e("input", { value: displayName(users, draftForm.backupOwnerUserId) || "—", readOnly: true })),
              e(Field, { label: "Version", hint: "System-managed" }, e("input", { className: "mono", value: record.versionId || "—", readOnly: true })),
              e(Field, { label: "Plan status", hint: "System-managed" }, e("input", { value: record.status || "—", readOnly: true })),
              e(Field, { label: "Claimed RTO (hh:mm)" }, e("input", { className: "mono", readOnly: !canEdit, placeholder: "02:00", value: draftForm.claimedRto, onChange: (ev) => setPlan("claimedRto", ev.target.value) })),
              e(Field, { label: "Claimed RPO (hh:mm)" }, e("input", { className: "mono", readOnly: !canEdit, placeholder: "00:05", value: draftForm.claimedRpo, onChange: (ev) => setPlan("claimedRpo", ev.target.value) }))
            ),
            e("div", { className: "card-toolbar" },
              e("h3", { style: { margin: 0 } }, "Execution plan"),
              canEdit && e("button", { type: "button", className: "secondary", onClick: () => setDraftForm({ ...draftForm, steps: [...draftForm.steps, stepFrom({ order: draftForm.steps.length + 1 }, draftForm.steps.length)] }) }, e(Icon, { name: "add" }), "Add step")
            ),
            (draftForm.steps || []).length
              ? draftForm.steps.map((s, i) =>
                  e("div", { className: "step-card step-view", key: s.stepId || i },
                    e("div", { className: "badge-row", style: { marginBottom: 8 } },
                      e("span", { className: "ci-id" }, s.order || i + 1),
                      e("span", { className: "chip" }, s.estimatedDurationMinutes ? `${s.estimatedDurationMinutes} min` : "duration unset"),
                      canEdit && e("button", { type: "button", className: "secondary", onClick: () => setDraftForm({ ...draftForm, steps: draftForm.steps.filter((_, j) => j !== i) }) }, "Remove")
                    ),
                    e("div", { className: "form-grid two" },
                      e(Field, { label: "Step number", required: true }, e("input", { type: "number", required: true, readOnly: !canEdit, value: s.order, onChange: (ev) => {
                        const steps = [...draftForm.steps]; steps[i] = { ...s, order: Number(ev.target.value) }; setDraftForm({ ...draftForm, steps });
                      } })),
                      e(Field, { label: "Step title", required: true }, e("input", { required: true, readOnly: !canEdit, value: s.title, onChange: (ev) => {
                        const steps = [...draftForm.steps]; steps[i] = { ...s, title: ev.target.value }; setDraftForm({ ...draftForm, steps });
                      } })),
                      e(Field, { label: "Step owner / role", required: true }, e("input", { required: true, readOnly: !canEdit, value: s.ownerRole, onChange: (ev) => {
                        const steps = [...draftForm.steps]; steps[i] = { ...s, ownerRole: ev.target.value }; setDraftForm({ ...draftForm, steps });
                      } })),
                      e(Field, { label: "Estimated duration (minutes)" }, e("input", { type: "number", readOnly: !canEdit, value: s.estimatedDurationMinutes, onChange: (ev) => {
                        const steps = [...draftForm.steps]; steps[i] = { ...s, estimatedDurationMinutes: ev.target.value }; setDraftForm({ ...draftForm, steps });
                      } })),
                      e(Field, { label: "Prerequisite step(s)" }, e("input", { readOnly: !canEdit, value: s.prerequisite, onChange: (ev) => {
                        const steps = [...draftForm.steps]; steps[i] = { ...s, prerequisite: ev.target.value }; setDraftForm({ ...draftForm, steps });
                      } }))
                    ),
                    e(Field, { label: "Step description", required: true }, e("textarea", { required: true, readOnly: !canEdit, value: s.instruction, onChange: (ev) => {
                      const steps = [...draftForm.steps]; steps[i] = { ...s, instruction: ev.target.value }; setDraftForm({ ...draftForm, steps });
                    } })),
                    e(Field, { label: "Rollback instructions" }, e("textarea", { readOnly: !canEdit, value: s.rollback, onChange: (ev) => {
                      const steps = [...draftForm.steps]; steps[i] = { ...s, rollback: ev.target.value }; setDraftForm({ ...draftForm, steps });
                    } })),
                    e(Field, { label: "Verification / check" }, e("textarea", { readOnly: !canEdit, value: s.verification, onChange: (ev) => {
                      const steps = [...draftForm.steps]; steps[i] = { ...s, verification: ev.target.value }; setDraftForm({ ...draftForm, steps });
                    } }))
                  )
                )
              : e("p", { className: "muted" }, "No steps on this plan yet.")
          )
    ),
    show("team") && e("article", { className: "card", style: { marginTop: 12 } },
      e("div", { className: "card-toolbar" },
        e("div", null,
          e("h2", { style: { margin: 0 } }, "Recovery Team & Contacts"),
          e("p", { className: "muted" }, "Contacts and attachments captured on the plan — not a separate copy.")
        ),
        planActions
      ),
      planLockNote,
      !record
        ? e("div", { className: "empty" }, e("p", null, "No plan yet. Contacts added during Create Plan appear here."))
        : e("div", { className: "stack" },
            e("div", { className: "card-toolbar" },
              e("h3", { style: { margin: 0 } }, "Contacts"),
              canEdit && e("button", { type: "button", className: "secondary", onClick: () => setDraftForm({ ...draftForm, contacts: [...(draftForm.contacts || []), contactFrom({})] }) }, e(Icon, { name: "add" }), "Add contact")
            ),
            (draftForm?.contacts || []).length
              ? draftForm.contacts.map((c, i) => {
                  const kind = CONTACT_KIND[c.contactType] || { kind: "neutral", label: pretty(c.contactType) || "—" };
                  return e("div", { className: "step-card", key: i },
                    e("div", { className: "badge-row", style: { marginBottom: 8 } },
                      e(StatusPill, { kind: kind.kind }, kind.label),
                      c.escalationOrder !== "" && c.escalationOrder != null && e("span", { className: "chip" }, `Escalation ${c.escalationOrder}`),
                      canEdit && e("button", { type: "button", className: "secondary", onClick: () => setDraftForm({ ...draftForm, contacts: draftForm.contacts.filter((_, j) => j !== i) }) }, "Remove")
                    ),
                    e("div", { className: "form-grid two" },
                      e(Field, { label: "Contact name", required: true }, e("input", { required: true, readOnly: !canEdit, value: c.name, onChange: (ev) => {
                        const contacts = [...draftForm.contacts]; contacts[i] = { ...c, name: ev.target.value }; setDraftForm({ ...draftForm, contacts });
                      } })),
                      e(Field, { label: "Role", required: true }, e("input", { required: true, readOnly: !canEdit, value: c.role, onChange: (ev) => {
                        const contacts = [...draftForm.contacts]; contacts[i] = { ...c, role: ev.target.value }; setDraftForm({ ...draftForm, contacts });
                      } })),
                      e(Field, { label: "Contact type", required: true }, e(Select, {
                        required: true, disabled: !canEdit, value: c.contactType,
                        onChange: (ev) => {
                          const contacts = [...draftForm.contacts]; contacts[i] = { ...c, contactType: ev.target.value }; setDraftForm({ ...draftForm, contacts });
                        },
                        options: cat.contactTypes || ["primary", "backup", "escalation", "vendor"],
                      })),
                      e(Field, { label: "Email", required: true }, e("input", { required: true, type: "email", readOnly: !canEdit, value: c.email, onChange: (ev) => {
                        const contacts = [...draftForm.contacts]; contacts[i] = { ...c, email: ev.target.value }; setDraftForm({ ...draftForm, contacts });
                      } })),
                      e(Field, { label: "Phone", required: true }, e("input", { required: true, readOnly: !canEdit, value: c.phone, onChange: (ev) => {
                        const contacts = [...draftForm.contacts]; contacts[i] = { ...c, phone: ev.target.value }; setDraftForm({ ...draftForm, contacts });
                      } })),
                      e(Field, { label: "Escalation order" }, e("input", { type: "number", readOnly: !canEdit, value: c.escalationOrder, onChange: (ev) => {
                        const contacts = [...draftForm.contacts]; contacts[i] = { ...c, escalationOrder: ev.target.value }; setDraftForm({ ...draftForm, contacts });
                      } }))
                    )
                  );
                })
              : e("p", { className: "muted" }, "No contacts recorded."),
            e("h3", { style: { marginTop: 20 } }, "Attachments"),
            e("table", { className: "list-table" },
              e("thead", null, e("tr", null, e("th", null, "File name"), e("th", null, "Kind"), e("th", null, "Note"), canEdit && e("th", null, ""))),
              e("tbody", null,
                (record.attachments || []).length
                  ? (record.attachments || []).map((a) => e("tr", { key: a.id },
                      e("td", null, a.fileName || "—"),
                      e("td", null, pretty(a.kind) || "—"),
                      e("td", null, a.note || "—"),
                      canEdit && e("td", null, e("button", { type: "button", className: "secondary", onClick: async () => {
                        try {
                          await api(`/api/itdr/versions/${draft.versionId}`, { method: "PATCH", body: JSON.stringify({ etag: draftForm.etag, attachmentRemoveId: a.id }) });
                          await load();
                        } catch (err) { onError(err.message); }
                      } }, "Remove"))
                    ))
                  : e("tr", null, e("td", { colSpan: canEdit ? 4 : 3, className: "muted" }, "No attachments."))
              )
            ),
            canEdit && e("div", { className: "form-grid two", style: { marginTop: 12 } },
              e(Field, { label: "File name" }, e("input", { value: att.fileName, onChange: (ev) => setAtt({ ...att, fileName: ev.target.value }), placeholder: "network-diagram.pdf" })),
              e(Field, { label: "Kind" }, e(Select, { value: att.kind, onChange: (ev) => setAtt({ ...att, kind: ev.target.value }), options: cat.attachKinds || ["diagram", "config_backup", "vendor_sla"] })),
              e(Field, { label: "Note" }, e("input", { value: att.note, onChange: (ev) => setAtt({ ...att, note: ev.target.value }) }))
            ),
            canEdit && e("div", { className: "row" },
              e("button", { type: "button", className: "secondary", onClick: async () => {
                if (!att.fileName) { onError("File name is required"); return; }
                try {
                  await api(`/api/itdr/versions/${draft.versionId}`, { method: "PATCH", body: JSON.stringify({ etag: draftForm.etag, attachmentsAdd: [att] }) });
                  setAtt({ fileName: "", kind: "diagram", note: "" });
                  await load();
                } catch (err) { onError(err.message); }
              } }, e(Icon, { name: "attach_file" }), "Add attachment")
            )
          )
    ),
    show("tests") && e("article", { className: "card", style: { marginTop: 12 } },
      e("div", { className: "card-toolbar" },
        e("div", null,
          e("h2", { style: { margin: 0 } }, "DR Test history"),
          e("p", { className: "muted" }, "Read-only here. Record or edit results in Testing.")
        ),
        e("a", { href: "#testing", className: "secondary", style: { display: "inline-flex", alignItems: "center", height: 36, padding: "0 12px", border: "1px solid var(--line-soft)", borderRadius: 4, fontWeight: 600 } }, "Open test records")
      ),
      e("table", { className: "list-table" },
        e("thead", null, e("tr", null, e("th", null, "Test"), e("th", null, "Mode"), e("th", null, "Result"), e("th", null, "Actual RTO/RPO"), e("th", null, "Remediation"), e("th", null, "When"))),
        e("tbody", null,
          (t.tests || []).length
            ? t.tests.map((x) => e("tr", { key: x.testId, className: "clickable", onClick: () => { location.hash = "#testing"; } },
                e("td", { className: "mono" }, e("a", { href: "#testing" }, x.testId)),
                e("td", null, pretty(x.exerciseMode) || "—"),
                e("td", null, x.outcome || x.status || "—"),
                e("td", { className: "mono" }, `${hhmm(x.actualRtoMinutes)} / ${hhmm(x.actualRpoMinutes)}`),
                e("td", null, x.remediationRequired ? "Yes" : "No"),
                e("td", { className: "mono" }, x.completedAt || x.requestedAt || "—")
              ))
            : e("tr", null, e("td", { colSpan: 6, className: "muted" }, "No tests linked to this plan yet."))
        )
      )
    ),
    e("div", { className: "row" }, e("button", { className: "secondary", type: "button", onClick: () => { location.hash = "#coverage"; } }, "Back to applications")),
    showPlan && e(PlanModal, {
      apps: [t],
      defaultAppId: id,
      catalogs,
      users,
      session,
      onClose: () => setShowPlan(false),
      onError,
      onCreated: async () => { setShowPlan(false); await load(); goTab("runbook"); },
    })
  );
}
