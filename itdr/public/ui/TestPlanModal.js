import { e, useState, api, Field, Select, UserSelect, Icon, StatusPill } from "./core.js";

const TEST_TYPES = [
  "Tabletop Exercise",
  "Simulation Test",
  "Failover Test",
  "Full DR Test",
  "Other",
];

const STRATEGIES = [
  "Hot Site (Active-Passive Cloud Failover)",
  "Warm Site (Multi-Cloud Failover)",
  "Cold Site / Backup & Restore",
  "Cloud DR (Automated Infrastructure)",
  "SaaS Vendor Secondary Instance",
];

function emptyStep(idx = 1) {
  return {
    stepNumber: idx,
    title: "",
    procedure: "",
    assigneeRole: "",
    expectedResult: "",
  };
}

export function TestPlanModal({ plan, catalog, users, session, onClose, onSave, onApprove, onReject, viewOnly }) {
  const isNew = !plan || !plan.testPlanId;
  const isApprover = ["APPROVER", "ADMIN"].includes(session?.role);
  const isOwner = ["PLAN_OWNER", "ADMIN", "TEST_MANAGER"].includes(session?.role);

  const [form, setForm] = useState(() => ({
    testPlanId: plan?.testPlanId || "",
    applicationName: plan?.applicationName || catalog?.applications?.[0]?.name || "Global Core Banking Engine",
    targetBiaApplicationId: plan?.targetBiaApplicationId || catalog?.applications?.[0]?.biaApplicationId || "bia-app-core-banking",
    businessUnit: plan?.businessUnit || "Retail & Core Banking Operations",
    applicationOwnerUserId: plan?.applicationOwnerUserId || "user-plan-owner",
    applicationOwnerName: plan?.applicationOwnerName || "Alex Owner",
    itdrOwnerUserId: plan?.itdrOwnerUserId || "user-admin",
    itdrOwnerName: plan?.itdrOwnerName || "Renu Shah",
    testType: plan?.testType || "Failover Test",
    testObjective: plan?.testObjective || "Validate automated database failover to secondary datacenter and verify recovery time < target RTO.",
    testScope: plan?.testScope || "Primary Core Ledger, Database Cluster, Message Queue Broker, API Ingress.",
    testScenario: plan?.testScenario || "Simulated primary datacenter failure with instantaneous DNS redirection and stand-by replica promotion.",
    recoveryStrategy: plan?.recoveryStrategy || "Hot Site (Active-Passive Cloud Failover)",
    plannedTestDate: plan?.plannedTestDate || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    plannedStartTime: plan?.plannedStartTime || "02:00",
    plannedEndTime: plan?.plannedEndTime || "06:00",
    targetRtoMinutes: plan?.targetRtoMinutes ?? 240,
    targetRpoMinutes: plan?.targetRpoMinutes ?? 30,
    recoveryEnvironment: plan?.recoveryEnvironment || "Secondary DR Site (AWS eu-west-1)",
    dependencies: plan?.dependencies || "AWS DirectConnect 10Gbps, Cross-Region Database Sync, Active Directory DR Replica",
    participants: (plan?.participants || ["Renu Shah (DR Coordinator)", "Alex Owner (App Owner)", "Lead DBA", "Infra Lead"]).join(", "),
    rolesResponsibilities: plan?.rolesResponsibilities || "DR Coordinator: Incident declaration & timing. DBA: Replica promotion. Infra: DNS route switch. QA: Sanity tests.",
    steps: plan?.steps && plan.steps.length > 0 ? plan.steps : [emptyStep(1), emptyStep(2), emptyStep(3)],
    successCriteria: plan?.successCriteria || "RTO <= target, RPO <= target, 100% synthetic test pass rate, no ledger discrepancy.",
    requiredEvidence: plan?.requiredEvidence || "CloudWatch promotion logs, Route53 cutover timestamp logs, QA sanity execution report.",
    risksConstraints: plan?.risksConstraints || "Maintenance window strictly limited to 4 hours; high network sync bandwidth.",
    remarks: plan?.remarks || "Mandatory annual regulatory compliance test under ISO 22301 framework.",
    status: plan?.status || "Draft",
  }));

  const [activeTab, setActiveTab] = useState("general"); // general | steps | criteria
  const [busy, setBusy] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");

  function setField(name, val) {
    setForm((f) => ({ ...f, [name]: val }));
  }

  function setStep(idx, key, val) {
    setForm((f) => {
      const steps = [...f.steps];
      steps[idx] = { ...steps[idx], [key]: val };
      return { ...f, steps };
    });
  }

  function addStep() {
    setForm((f) => ({ ...f, steps: [...f.steps, emptyStep(f.steps.length + 1)] }));
  }

  function removeStep(idx) {
    setForm((f) => {
      const steps = f.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stepNumber: i + 1 }));
      return { ...f, steps };
    });
  }

  async function handleSave(submitAfter = false) {
    setBusy(true);
    try {
      const payload = {
        ...form,
        targetRtoMinutes: Number(form.targetRtoMinutes),
        targetRpoMinutes: Number(form.targetRpoMinutes),
        participants: form.participants.split(/[,|\n]/).map((s) => s.trim()).filter(Boolean),
      };

      let saved;
      if (isNew) {
        saved = await api("/api/testing/plans", { method: "POST", body: JSON.stringify(payload) });
      } else {
        saved = await api(`/api/testing/plans/${encodeURIComponent(form.testPlanId)}`, { method: "PUT", body: JSON.stringify(payload) });
      }

      if (submitAfter && saved.status === "Draft") {
        saved = await api(`/api/testing/plans/${encodeURIComponent(saved.testPlanId)}/submit`, {
          method: "POST",
          body: JSON.stringify({ notes: "Submitted for approver review." }),
        });
      }

      onSave(saved);
      onClose();
    } catch (err) {
      alert(`Error saving test plan: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    setBusy(true);
    try {
      const res = await api(`/api/testing/plans/${encodeURIComponent(form.testPlanId)}/approve`, {
        method: "POST",
        body: JSON.stringify({ notes: approvalNotes || "Approved for execution." }),
      });
      if (onApprove) onApprove(res);
      onClose();
    } catch (err) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!approvalNotes) {
      alert("Please provide rejection comments / feedback.");
      return;
    }
    setBusy(true);
    try {
      const res = await api(`/api/testing/plans/${encodeURIComponent(form.testPlanId)}/reject`, {
        method: "POST",
        body: JSON.stringify({ notes: approvalNotes }),
      });
      if (onReject) onReject(res);
      onClose();
    } catch (err) {
      alert(`Rejection error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  const isReadOnly = viewOnly || (form.status !== "Draft" && !isApprover);

  return e(
    "div",
    { className: "modal-backdrop", onClick: (ev) => { if (ev.target === ev.currentTarget) onClose(); } },
    e(
      "div",
      { className: "modal", style: { maxWidth: "880px" }, role: "dialog", "aria-modal": "true" },
      // Header
      e(
        "div",
        { className: "modal-head" },
        e(
          "div",
          null,
          e(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "10px" } },
            e("h2", null, isNew ? "Create ITDR Test Plan" : `ITDR Test Plan: ${form.testPlanId}`),
            e("span", { className: `status-pill kind-${form.status === "Ready for Execution" || form.status === "Approved" ? "approved" : form.status === "Submitted" ? "review" : form.status === "Executed" ? "published" : "draft"}` }, form.status)
          ),
          e("p", { className: "muted" }, "Prepare and approve planned recovery procedures, expected outcomes, and target SLAs before drill execution.")
        ),
        e("button", { type: "button", className: "icon-btn", onClick: onClose }, "×")
      ),

      // Navigation Tabs
      e(
        "div",
        { style: { padding: "0 20px", borderBottom: "1px solid var(--line-soft)", background: "var(--surface-low)" } },
        e(
          "div",
          { className: "tab-bar", style: { margin: "8px 0" } },
          e("button", { type: "button", className: `tab${activeTab === "general" ? " active" : ""}`, onClick: () => setActiveTab("general") }, e(Icon, { name: "info" }), "General & Schedule"),
          e("button", { type: "button", className: `tab${activeTab === "steps" ? " active" : ""}`, onClick: () => setActiveTab("steps") }, e(Icon, { name: "checklist" }), `Test Procedure Steps (${form.steps.length})`),
          e("button", { type: "button", className: `tab${activeTab === "criteria" ? " active" : ""}`, onClick: () => setActiveTab("criteria") }, e(Icon, { name: "verified" }), "Criteria, Scope & Evidence")
        )
      ),

      // Modal Body
      e(
        "div",
        { className: "modal-body" },
        activeTab === "general" &&
          e(
            "div",
            null,
            e(
              "div",
              { className: "form-grid two" },
              e(Field, { label: "ITDR / Application Name", required: true },
                e("input", {
                  disabled: isReadOnly,
                  value: form.applicationName,
                  onChange: (ev) => setField("applicationName", ev.target.value),
                  placeholder: "e.g. Global Core Banking Engine",
                })
              ),
              e(Field, { label: "Business Unit / Department", required: true },
                e("input", {
                  disabled: isReadOnly,
                  value: form.businessUnit,
                  onChange: (ev) => setField("businessUnit", ev.target.value),
                  placeholder: "e.g. Retail Banking Operations",
                })
              ),
              e(Field, { label: "Application Owner", required: true },
                e(UserSelect, {
                  users: users || [],
                  disabled: isReadOnly,
                  value: form.applicationOwnerUserId,
                  onChange: (ev) => {
                    const u = (users || []).find((x) => x.userId === ev.target.value);
                    setField("applicationOwnerUserId", ev.target.value);
                    if (u) setField("applicationOwnerName", u.displayName);
                  },
                })
              ),
              e(Field, { label: "ITDR Owner / Coordinator", required: true },
                e(UserSelect, {
                  users: users || [],
                  disabled: isReadOnly,
                  value: form.itdrOwnerUserId,
                  onChange: (ev) => {
                    const u = (users || []).find((x) => x.userId === ev.target.value);
                    setField("itdrOwnerUserId", ev.target.value);
                    if (u) setField("itdrOwnerName", u.displayName);
                  },
                })
              ),
              e(Field, { label: "Test Type", required: true },
                e(Select, {
                  disabled: isReadOnly,
                  value: form.testType,
                  onChange: (ev) => setField("testType", ev.target.value),
                  options: TEST_TYPES,
                })
              ),
              e(Field, { label: "Recovery Strategy", required: true },
                e(Select, {
                  disabled: isReadOnly,
                  value: form.recoveryStrategy,
                  onChange: (ev) => setField("recoveryStrategy", ev.target.value),
                  options: STRATEGIES,
                })
              ),
              e(Field, { label: "Planned Test Date", required: true },
                e("input", {
                  type: "date",
                  disabled: isReadOnly,
                  value: form.plannedTestDate,
                  onChange: (ev) => setField("plannedTestDate", ev.target.value),
                })
              ),
              e(
                "div",
                { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } },
                e(Field, { label: "Planned Start Time", required: true },
                  e("input", {
                    type: "time",
                    disabled: isReadOnly,
                    value: form.plannedStartTime,
                    onChange: (ev) => setField("plannedStartTime", ev.target.value),
                  })
                ),
                e(Field, { label: "Planned End Time", required: true },
                  e("input", {
                    type: "time",
                    disabled: isReadOnly,
                    value: form.plannedEndTime,
                    onChange: (ev) => setField("plannedEndTime", ev.target.value),
                  })
                )
              ),
              e(Field, { label: "Target RTO (Minutes)", required: true, hint: "Expected max recovery duration (e.g. 240 mins = 4 hrs)" },
                e("input", {
                  type: "number",
                  min: 1,
                  disabled: isReadOnly,
                  value: form.targetRtoMinutes,
                  onChange: (ev) => setField("targetRtoMinutes", ev.target.value),
                })
              ),
              e(Field, { label: "Target RPO (Minutes)", required: true, hint: "Max tolerable data loss window (e.g. 30 mins)" },
                e("input", {
                  type: "number",
                  min: 0,
                  disabled: isReadOnly,
                  value: form.targetRpoMinutes,
                  onChange: (ev) => setField("targetRpoMinutes", ev.target.value),
                })
              ),
              e(Field, { label: "Recovery Environment / DR Site", required: true },
                e("input", {
                  disabled: isReadOnly,
                  value: form.recoveryEnvironment,
                  onChange: (ev) => setField("recoveryEnvironment", ev.target.value),
                  placeholder: "e.g. Secondary Datacenter / AWS eu-west-1",
                })
              ),
              e(Field, { label: "Dependencies / Prerequisites" },
                e("input", {
                  disabled: isReadOnly,
                  value: form.dependencies,
                  onChange: (ev) => setField("dependencies", ev.target.value),
                  placeholder: "e.g. AWS DirectConnect, Active Directory sync",
                })
              )
            ),
            e(Field, { label: "Participants / Test Team", hint: "Comma separated names and roles" },
              e("input", {
                disabled: isReadOnly,
                value: form.participants,
                onChange: (ev) => setField("participants", ev.target.value),
                placeholder: "Renu Shah (Coordinator), Alex Owner (App Owner), DBA Lead...",
              })
            ),
            e(Field, { label: "Roles and Responsibilities" },
              e("textarea", {
                rows: 2,
                disabled: isReadOnly,
                value: form.rolesResponsibilities,
                onChange: (ev) => setField("rolesResponsibilities", ev.target.value),
                placeholder: "Detail assignments for incident command, network routing, database promotion, and QA...",
              })
            )
          ),

        activeTab === "steps" &&
          e(
            "div",
            null,
            e(
              "div",
              { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" } },
              e("p", { className: "muted", style: { margin: 0 } }, "Define step-by-step procedures with assignees and explicit expected results."),
              !isReadOnly && e("button", { type: "button", className: "secondary", onClick: addStep }, e(Icon, { name: "add" }), "Add Step")
            ),
            form.steps.map((s, idx) =>
              e(
                "div",
                { key: idx, className: "step-card", style: { background: "var(--surface-low)", border: "1px solid var(--line-soft)", borderRadius: "8px", padding: "14px", marginBottom: "12px" } },
                e(
                  "div",
                  { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } },
                  e("strong", { style: { fontSize: "13px" } }, `Step ${s.stepNumber}`),
                  !isReadOnly && form.steps.length > 1 &&
                    e("button", { type: "button", className: "icon-btn", style: { fontSize: "16px" }, onClick: () => removeStep(idx), title: "Remove step" }, "🗑")
                ),
                e(
                  "div",
                  { className: "form-grid two" },
                  e(Field, { label: "Step Title", required: true },
                    e("input", {
                      disabled: isReadOnly,
                      value: s.title,
                      onChange: (ev) => setStep(idx, "title", ev.target.value),
                      placeholder: "e.g. Promote Secondary Database",
                    })
                  ),
                  e(Field, { label: "Assignee / Owner Role", required: true },
                    e("input", {
                      disabled: isReadOnly,
                      value: s.assigneeRole,
                      onChange: (ev) => setStep(idx, "assigneeRole", ev.target.value),
                      placeholder: "e.g. Lead DBA / Infra Lead",
                    })
                  )
                ),
                e(Field, { label: "Procedure / Instructions", required: true },
                  e("textarea", {
                    rows: 2,
                    disabled: isReadOnly,
                    value: s.procedure,
                    onChange: (ev) => setStep(idx, "procedure", ev.target.value),
                    placeholder: "Detailed execution command, runbook link, or procedure steps...",
                  })
                ),
                e(Field, { label: "Expected Result (Pre-defined Success Outcome)", required: true },
                  e("input", {
                    disabled: isReadOnly,
                    value: s.expectedResult,
                    onChange: (ev) => setStep(idx, "expectedResult", ev.target.value),
                    placeholder: "e.g. Database accepts read-write connections within 15 minutes",
                  })
                )
              )
            )
          ),

        activeTab === "criteria" &&
          e(
            "div",
            null,
            e(Field, { label: "Test Objective", required: true },
              e("textarea", {
                rows: 2,
                disabled: isReadOnly,
                value: form.testObjective,
                onChange: (ev) => setField("testObjective", ev.target.value),
              })
            ),
            e(Field, { label: "Test Scope", required: true },
              e("input", {
                disabled: isReadOnly,
                value: form.testScope,
                onChange: (ev) => setField("testScope", ev.target.value),
              })
            ),
            e(Field, { label: "Test Scenario", required: true },
              e("input", {
                disabled: isReadOnly,
                value: form.testScenario,
                onChange: (ev) => setField("testScenario", ev.target.value),
              })
            ),
            e(
              "div",
              { className: "form-grid two" },
              e(Field, { label: "Success / Pass Criteria", required: true },
                e("textarea", {
                  rows: 2,
                  disabled: isReadOnly,
                  value: form.successCriteria,
                  onChange: (ev) => setField("successCriteria", ev.target.value),
                  placeholder: "RTO <= Target, RPO <= Target, 0 data loss...",
                })
              ),
              e(Field, { label: "Required Evidence", required: true },
                e("textarea", {
                  rows: 2,
                  disabled: isReadOnly,
                  value: form.requiredEvidence,
                  onChange: (ev) => setField("requiredEvidence", ev.target.value),
                  placeholder: "CloudWatch logs, DNS flip logs, QA test execution report...",
                })
              )
            ),
            e(
              "div",
              { className: "form-grid two" },
              e(Field, { label: "Risks / Constraints" },
                e("input", {
                  disabled: isReadOnly,
                  value: form.risksConstraints,
                  onChange: (ev) => setField("risksConstraints", ev.target.value),
                  placeholder: "e.g. 4-hour maintenance window limit",
                })
              ),
              e(Field, { label: "Remarks / Regulatory References" },
                e("input", {
                  disabled: isReadOnly,
                  value: form.remarks,
                  onChange: (ev) => setField("remarks", ev.target.value),
                  placeholder: "e.g. ISO 22301 / DORA compliance audit requirement",
                })
              )
            ),

            // Approval review panel if Submitted
            form.status === "Submitted" && isApprover &&
              e(
                "div",
                { style: { background: "var(--warn-bg)", border: "1px solid var(--warn-border)", borderRadius: "8px", padding: "14px", marginTop: "16px" } },
                e("strong", { style: { color: "var(--warn-text)", display: "block", marginBottom: "6px" } }, "Approver Review Actions"),
                e(Field, { label: "Approval Notes / Feedback" },
                  e("input", {
                    value: approvalNotes,
                    onChange: (ev) => setApprovalNotes(ev.target.value),
                    placeholder: "Enter review comments or reason for approval/rejection...",
                  })
                )
              )
          )
      ),

      // Footer
      e(
        "div",
        { className: "modal-foot" },
        e("button", { type: "button", className: "secondary", onClick: onClose }, "Close"),

        // Approver buttons
        form.status === "Submitted" && isApprover &&
          e("button", { type: "button", className: "danger", onClick: handleReject, disabled: busy }, "Reject"),
        form.status === "Submitted" && isApprover &&
          e("button", { type: "button", className: "accent", onClick: handleApprove, disabled: busy }, e(Icon, { name: "check" }), "Approve for Execution"),

        // Owner/Admin draft save buttons
        form.status === "Draft" && isOwner &&
          e("button", { type: "button", className: "secondary", onClick: () => handleSave(false), disabled: busy }, "Save Draft"),
        form.status === "Draft" && isOwner &&
          e("button", { type: "button", className: "accent", onClick: () => handleSave(true), disabled: busy }, e(Icon, { name: "send" }), "Submit for Approval")
      )
    )
  );
}
