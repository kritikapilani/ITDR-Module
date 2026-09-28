import { e, useState, api, Field, Select, Icon, StatusPill } from "./core.js";

const OVERALL_OUTCOMES = [
  "Passed",
  "Passed with Observations",
  "Failed",
];

const STEP_STATUS_OPTIONS = [
  "Passed",
  "Failed",
  "Not Executed",
  "Not Applicable",
];

const ACTION_STATUS_OPTIONS = [
  "Open",
  "In Progress",
  "Closed",
];

function emptyAction(idx = 1) {
  return {
    actionId: `ACT-00${idx}`,
    actionDescription: "",
    actionOwner: "",
    targetClosureDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    actionStatus: "Open",
  };
}

export function TestResultModal({ testPlan: initialPlan, availablePlans = [], existingResult, onClose, onSave, session }) {
  const initialPlanId = initialPlan?.testPlanId || existingResult?.testPlanId || availablePlans[0]?.testPlanId || "";
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId);
  const activePlan = (availablePlans || []).find((p) => p.testPlanId === selectedPlanId) || initialPlan || availablePlans[0] || null;

  const [form, setForm] = useState(() => {
    const plannedSteps = activePlan?.steps || [];
    const stepResults = plannedSteps.map((ps, idx) => {
      const existingStep = existingResult?.stepResults?.find((s) => s.stepNumber === ps.stepNumber);
      return {
        stepNumber: ps.stepNumber ?? idx + 1,
        stepTitle: ps.title,
        procedure: ps.procedure,
        expectedResult: ps.expectedResult,
        actualResult: existingStep?.actualResult || "Executed successfully as per runbook.",
        stepStatus: existingStep?.stepStatus || "Passed",
        durationMinutes: existingStep?.durationMinutes ?? 15,
        executionNotes: existingStep?.executionNotes || "",
      };
    });

    return {
      resultId: existingResult?.resultId || "",
      testPlanId: activePlan?.testPlanId || "",
      applicationName: activePlan?.applicationName || "",
      targetBiaApplicationId: activePlan?.targetBiaApplicationId || "",
      actualTestDate: existingResult?.actualTestDate || new Date().toISOString().slice(0, 10),
      actualStartTime: existingResult?.actualStartTime || activePlan?.plannedStartTime || "02:00",
      actualEndTime: existingResult?.actualEndTime || activePlan?.plannedEndTime || "05:30",
      actualRecoveryTimeMinutes: existingResult?.actualRecoveryTimeMinutes ?? (activePlan?.targetRtoMinutes ? Math.max(15, activePlan.targetRtoMinutes - 30) : 180),
      actualRpoAchievedMinutes: existingResult?.actualRpoAchievedMinutes ?? (activePlan?.targetRpoMinutes ? Math.max(5, activePlan.targetRpoMinutes - 10) : 20),
      overallResult: existingResult?.overallResult || "Passed",
      stepResults: stepResults.length > 0 ? stepResults : [
        {
          stepNumber: 1,
          stepTitle: "Failover Execution",
          procedure: "Execute database & service failover",
          expectedResult: "Services fail over cleanly",
          actualResult: "Failover verified successfully",
          stepStatus: "Passed",
          durationMinutes: 30,
          executionNotes: "",
        },
      ],
      evidenceAttachments: existingResult?.evidenceAttachments || "https://audit-vault.enterprise.internal/evidence/execution-run.pdf",
      issuesObservations: existingResult?.issuesObservations || "",
      deviationFromPlan: existingResult?.deviationFromPlan || "None. Executed as planned.",
      rootCause: existingResult?.rootCause || "N/A - successful test.",
      correctiveActions: existingResult?.correctiveActions || [],
      remarks: existingResult?.remarks || "All stakeholders confirmed successful failover verification.",
    };
  });

  function onPlanChange(newPlanId) {
    setSelectedPlanId(newPlanId);
    const p = (availablePlans || []).find((x) => x.testPlanId === newPlanId);
    if (p) {
      const stepResults = (p.steps || []).map((ps, idx) => ({
        stepNumber: ps.stepNumber ?? idx + 1,
        stepTitle: ps.title,
        procedure: ps.procedure,
        expectedResult: ps.expectedResult,
        actualResult: "Executed successfully as per runbook.",
        stepStatus: "Passed",
        durationMinutes: 15,
        executionNotes: "",
      }));

      setForm((f) => ({
        ...f,
        testPlanId: p.testPlanId,
        applicationName: p.applicationName,
        targetBiaApplicationId: p.targetBiaApplicationId,
        actualStartTime: p.plannedStartTime || f.actualStartTime || "02:00",
        actualEndTime: p.plannedEndTime || f.actualEndTime || "05:30",
        actualRecoveryTimeMinutes: p.targetRtoMinutes ? Math.max(15, p.targetRtoMinutes - 30) : f.actualRecoveryTimeMinutes,
        actualRpoAchievedMinutes: p.targetRpoMinutes ? Math.max(5, p.targetRpoMinutes - 10) : f.actualRpoAchievedMinutes,
        stepResults: stepResults.length > 0 ? stepResults : f.stepResults,
      }));
    }
  }

  const [activeTab, setActiveTab] = useState("actuals"); // actuals | steps | actions
  const [busy, setBusy] = useState(false);

  function setField(name, val) {
    setForm((f) => ({ ...f, [name]: val }));
  }

  function setStepResult(idx, key, val) {
    setForm((f) => {
      const stepResults = [...f.stepResults];
      stepResults[idx] = { ...stepResults[idx], [key]: val };
      return { ...f, stepResults };
    });
  }

  function addAction() {
    setForm((f) => ({ ...f, correctiveActions: [...f.correctiveActions, emptyAction(f.correctiveActions.length + 1)] }));
  }

  function setAction(idx, key, val) {
    setForm((f) => {
      const correctiveActions = [...f.correctiveActions];
      correctiveActions[idx] = { ...correctiveActions[idx], [key]: val };
      return { ...f, correctiveActions };
    });
  }

  function removeAction(idx) {
    setForm((f) => ({ ...f, correctiveActions: f.correctiveActions.filter((_, i) => i !== idx) }));
  }

  // Automatic SLA Calculation
  const targetRto = activePlan?.targetRtoMinutes;
  const actualRto = Number(form.actualRecoveryTimeMinutes);
  const isRtoMet = targetRto != null ? actualRto <= targetRto : null;

  const targetRpo = activePlan?.targetRpoMinutes;
  const actualRpo = Number(form.actualRpoAchievedMinutes);
  const isRpoMet = targetRpo != null ? actualRpo <= targetRpo : null;

  async function handleSubmit(ev) {
    ev.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        actualRecoveryTimeMinutes: Number(form.actualRecoveryTimeMinutes),
        actualRpoAchievedMinutes: Number(form.actualRpoAchievedMinutes),
      };

      const saved = await api("/api/testing/results", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      onSave(saved);
      onClose();
    } catch (err) {
      alert(`Error saving test execution result: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  return e(
    "div",
    { className: "modal-backdrop", onClick: (ev) => { if (ev.target === ev.currentTarget) onClose(); } },
    e(
      "div",
      { className: "modal", style: { maxWidth: "920px" }, role: "dialog", "aria-modal": "true" },
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
            e("h2", null, `Record ITDR Test Execution Results`),
            e("span", { className: "status-pill kind-approved" }, `Linked Plan: ${activePlan?.testPlanId || form.testPlanId}`)
          ),
          e("p", { className: "muted" }, `Application: ${activePlan?.applicationName || form.applicationName} · ${activePlan?.testType || "DR Test"}`)
        ),
        e("button", { type: "button", className: "icon-btn", onClick: onClose }, "×")
      ),

      // Live SLA Evaluation Callout
      e(
        "div",
        { style: { padding: "10px 20px", background: "var(--surface-low)", borderBottom: "1px solid var(--line-soft)", display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" } },
        e("span", { style: { fontSize: "12px", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" } }, "Live SLA Evaluation:"),
        e(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          e("span", { style: { fontSize: "12.5px" } }, `RTO Target: ${targetRto != null ? `${targetRto}m` : "—"} vs Actual: ${actualRto}m`),
          e("span", { className: `status-pill kind-${isRtoMet ? "approved" : "fail"}` }, isRtoMet ? "RTO Met" : "RTO Breached")
        ),
        e(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px" } },
          e("span", { style: { fontSize: "12.5px" } }, `RPO Target: ${targetRpo != null ? `${targetRpo}m` : "—"} vs Actual: ${actualRpo}m`),
          e("span", { className: `status-pill kind-${isRpoMet ? "approved" : "fail"}` }, isRpoMet ? "RPO Met" : "RPO Breached")
        )
      ),

      // Navigation Tabs
      e(
        "div",
        { style: { padding: "0 20px", borderBottom: "1px solid var(--line-soft)" } },
        e(
          "div",
          { className: "tab-bar", style: { margin: "8px 0" } },
          e("button", { type: "button", className: `tab${activeTab === "actuals" ? " active" : ""}`, onClick: () => setActiveTab("actuals") }, e(Icon, { name: "timer" }), "Actual Timing & Outcome"),
          e("button", { type: "button", className: `tab${activeTab === "steps" ? " active" : ""}`, onClick: () => setActiveTab("steps") }, e(Icon, { name: "task_alt" }), `Step-by-Step Results (${form.stepResults.length})`),
          e("button", { type: "button", className: `tab${activeTab === "actions" ? " active" : ""}`, onClick: () => setActiveTab("actions") }, e(Icon, { name: "build" }), `Observations & Remedial Actions (${form.correctiveActions.length})`)
        )
      ),

      // Form Body
      e(
        "form",
        { onSubmit: handleSubmit, style: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 } },
        e(
          "div",
          { className: "modal-body" },
          activeTab === "actuals" &&
            e(
              "div",
              null,
              e(
                "div",
                { className: "form-grid two" },
                availablePlans.length > 0 &&
                  e(Field, { label: "Associated ITDR Test Plan", required: true },
                    e("select", {
                      value: selectedPlanId,
                      onChange: (ev) => onPlanChange(ev.target.value),
                    },
                      availablePlans.map((p) =>
                        e("option", { key: p.testPlanId, value: p.testPlanId }, `${p.testPlanId} — ${p.applicationName} (${p.testType}) [Status: ${p.status}]`)
                      )
                    )
                  ),
                e(Field, { label: "Actual Test Date", required: true },
                  e("input", {
                    type: "date",
                    required: true,
                    value: form.actualTestDate,
                    onChange: (ev) => setField("actualTestDate", ev.target.value),
                  })
                ),
                e(Field, { label: "Overall Test Result", required: true },
                  e(Select, {
                    required: true,
                    value: form.overallResult,
                    onChange: (ev) => setField("overallResult", ev.target.value),
                    options: OVERALL_OUTCOMES,
                  })
                ),
                e(Field, { label: "Actual Start Time", required: true },
                  e("input", {
                    type: "time",
                    required: true,
                    value: form.actualStartTime,
                    onChange: (ev) => setField("actualStartTime", ev.target.value),
                  })
                ),
                e(Field, { label: "Actual End Time", required: true },
                  e("input", {
                    type: "time",
                    required: true,
                    value: form.actualEndTime,
                    onChange: (ev) => setField("actualEndTime", ev.target.value),
                  })
                ),
                e(Field, { label: "Actual Recovery Time (RTO Achieved in Minutes)", required: true, hint: `Target planned: ${targetRto || "—"} mins` },
                  e("input", {
                    type: "number",
                    min: 1,
                    required: true,
                    value: form.actualRecoveryTimeMinutes,
                    onChange: (ev) => setField("actualRecoveryTimeMinutes", ev.target.value),
                  })
                ),
                e(Field, { label: "Actual RPO Achieved (Data Loss in Minutes)", required: true, hint: `Target planned: ${targetRpo || "—"} mins` },
                  e("input", {
                    type: "number",
                    min: 0,
                    required: true,
                    value: form.actualRpoAchievedMinutes,
                    onChange: (ev) => setField("actualRpoAchievedMinutes", ev.target.value),
                  })
                )
              ),
              e(Field, { label: "Evidence / Attachment Links", hint: "URLs or archive repository reference for drill logs and reports" },
                e("input", {
                  value: form.evidenceAttachments,
                  onChange: (ev) => setField("evidenceAttachments", ev.target.value),
                  placeholder: "e.g. https://audit-vault.enterprise.internal/evidence/TR-2026-001.pdf",
                })
              ),
              e(Field, { label: "Remarks / Executive Summary" },
                e("textarea", {
                  rows: 3,
                  value: form.remarks,
                  onChange: (ev) => setField("remarks", ev.target.value),
                  placeholder: "Provide high-level execution summary, stakeholder sign-off, or notable conditions...",
                })
              )
            ),

          activeTab === "steps" &&
            e(
              "div",
              null,
              e("p", { className: "muted", style: { marginBottom: "12px" } }, "Compare each pre-planned expected step result with the actual execution outcome:"),
              form.stepResults.map((s, idx) =>
                e(
                  "div",
                  { key: idx, className: "step-card", style: { background: "var(--surface-low)", border: "1px solid var(--line-soft)", borderRadius: "8px", padding: "14px", marginBottom: "12px" } },
                  e(
                    "div",
                    { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } },
                    e("strong", null, `Step ${s.stepNumber}: ${s.stepTitle}`),
                    e(
                      "div",
                      { style: { display: "flex", alignItems: "center", gap: "8px" } },
                      e("span", { style: { fontSize: "11px", color: "var(--muted)" } }, "Step Status:"),
                      e(Select, {
                        value: s.stepStatus,
                        onChange: (ev) => setStepResult(idx, "stepStatus", ev.target.value),
                        options: STEP_STATUS_OPTIONS,
                      })
                    )
                  ),
                  e(
                    "div",
                    { style: { background: "#ffffff", padding: "8px 12px", borderRadius: "6px", marginBottom: "8px", fontSize: "12.5px" } },
                    e("div", { style: { color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 } }, "Expected Result (from Plan):"),
                    e("div", null, s.expectedResult || "—")
                  ),
                  e(
                    "div",
                    { className: "form-grid two" },
                    e(Field, { label: "Actual Result Achieved", required: true },
                      e("input", {
                        required: true,
                        value: s.actualResult,
                        onChange: (ev) => setStepResult(idx, "actualResult", ev.target.value),
                        placeholder: "e.g. Completed in 12 minutes without error",
                      })
                    ),
                    e(Field, { label: "Step Duration (Minutes)" },
                      e("input", {
                        type: "number",
                        min: 0,
                        value: s.durationMinutes,
                        onChange: (ev) => setStepResult(idx, "durationMinutes", ev.target.value),
                      })
                    )
                  ),
                  e(Field, { label: "Execution Notes" },
                    e("input", {
                      value: s.executionNotes,
                      onChange: (ev) => setStepResult(idx, "executionNotes", ev.target.value),
                      placeholder: "Observations or details during step execution...",
                    })
                  )
                )
              )
            ),

          activeTab === "actions" &&
            e(
              "div",
              null,
              e(
                "div",
                { className: "form-grid two" },
                e(Field, { label: "Issues / Observations" },
                  e("textarea", {
                    rows: 3,
                    value: form.issuesObservations,
                    onChange: (ev) => setField("issuesObservations", ev.target.value),
                    placeholder: "Log any unexpected bottlenecks, latency, or issues encountered...",
                  })
                ),
                e(Field, { label: "Deviation from Test Plan" },
                  e("textarea", {
                    rows: 3,
                    value: form.deviationFromPlan,
                    onChange: (ev) => setField("deviationFromPlan", ev.target.value),
                    placeholder: "Describe any deviations from the approved test plan steps...",
                  })
                )
              ),
              e(Field, { label: "Root Cause (if any failures or observations occurred)" },
                e("input", {
                  value: form.rootCause,
                  onChange: (ev) => setField("rootCause", ev.target.value),
                  placeholder: "Identify underlying root cause for any breaches or failures...",
                })
              ),

              // Remedial Actions Builder
              e(
                "div",
                { style: { marginTop: "18px", borderTop: "1px solid var(--line-soft)", paddingTop: "14px" } },
                e(
                  "div",
                  { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" } },
                  e("strong", null, "Corrective / Remedial Actions"),
                  e("button", { type: "button", className: "secondary", onClick: addAction }, e(Icon, { name: "add" }), "Add Remedial Action")
                ),
                form.correctiveActions.length === 0 &&
                  e("p", { className: "muted", style: { fontStyle: "italic" } }, "No remedial actions logged. Click '+ Add Remedial Action' if corrective steps are needed."),
                form.correctiveActions.map((act, i) =>
                  e(
                    "div",
                    { key: i, style: { background: "var(--surface-low)", border: "1px solid var(--line-soft)", borderRadius: "8px", padding: "12px", marginBottom: "10px" } },
                    e(
                      "div",
                      { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } },
                      e("span", { className: "ci-id" }, act.actionId),
                      e("button", { type: "button", className: "icon-btn", onClick: () => removeAction(i), title: "Remove action" }, "🗑")
                    ),
                    e(
                      "div",
                      { className: "form-grid two" },
                      e(Field, { label: "Action Description", required: true },
                        e("input", {
                          value: act.actionDescription,
                          onChange: (ev) => setAction(i, "actionDescription", ev.target.value),
                          placeholder: "e.g. Lower DNS TTL cache to 60s prior to drills",
                        })
                      ),
                      e(Field, { label: "Action Owner", required: true },
                        e("input", {
                          value: act.actionOwner,
                          onChange: (ev) => setAction(i, "actionOwner", ev.target.value),
                          placeholder: "e.g. Maria Gomez (Infra Ops)",
                        })
                      ),
                      e(Field, { label: "Target Closure Date", required: true },
                        e("input", {
                          type: "date",
                          value: act.targetClosureDate,
                          onChange: (ev) => setAction(i, "targetClosureDate", ev.target.value),
                        })
                      ),
                      e(Field, { label: "Action Status", required: true },
                        e(Select, {
                          value: act.actionStatus,
                          onChange: (ev) => setAction(i, "actionStatus", ev.target.value),
                          options: ACTION_STATUS_OPTIONS,
                        })
                      )
                    )
                  )
                )
              )
            )
        ),

        // Footer Actions
        e(
          "div",
          { className: "modal-foot" },
          e("button", { type: "button", className: "secondary", onClick: onClose }, "Cancel"),
          e("button", { type: "submit", className: "accent", disabled: busy }, e(Icon, { name: "save" }), busy ? "Saving…" : "Save Test Execution Results")
        )
      )
    )
  );
}
