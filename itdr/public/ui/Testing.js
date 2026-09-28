import { e, useState, useEffect, api, PageHeader, Metric, Icon, Crumb, Pill, pretty, minutesToHhmm } from "./core.js";
import { TestPlanModal } from "./TestPlanModal.js";
import { TestResultModal } from "./TestResultModal.js";
import { ComparisonView } from "./ComparisonView.js";

function formatMins(m) {
  if (m == null) return "—";
  const n = Number(m);
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return `${n}m`;
  const h = Math.floor(n / 60);
  const min = n % 60;
  return min ? `${h}h ${min}m` : `${h}h`;
}

export function Testing({ session, onError, view, focusTestId }) {
  const initialTab = view === "calendar" ? "calendar" : (view === "results" || view === "test-results") ? "results" : (view === "comparison") ? "comparison" : "plans";
  const [activeTab, setActiveTab] = useState(initialTab); // plans | results | comparison | calendar
  const [catalog, setCatalog] = useState(null);
  const [plans, setPlans] = useState([]);
  const [results, setResults] = useState([]);
  const [users, setUsers] = useState([]);

  // Modals state
  const [activePlanModal, setActivePlanModal] = useState(null); // null | { plan, viewOnly }
  const [activeResultModal, setActiveResultModal] = useState(null); // null | { testPlan, existingResult }
  const [comparePlanId, setComparePlanId] = useState("");

  // Filters
  const [planStatusFilter, setPlanStatusFilter] = useState("all");
  const [planSearch, setPlanSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");

  const canEdit = ["ADMIN", "PLAN_OWNER", "TEST_MANAGER"].includes(session?.role);
  const canApprove = ["APPROVER", "ADMIN"].includes(session?.role);
  const canExecute = ["TEST_MANAGER", "ADMIN", "PLAN_OWNER"].includes(session?.role);

  async function loadData() {
    try {
      const [optRes, plansRes, resultsRes, dirRes] = await Promise.all([
        api("/api/testing/options").catch(() => ({ applications: [], users: [] })),
        api("/api/testing/plans").catch(() => ({ items: [] })),
        api("/api/testing/results").catch(() => ({ items: [] })),
        api("/api/itdr/directory").catch(() => ({ users: [] })),
      ]);

      setCatalog(optRes);
      setPlans(plansRes.items || []);
      setResults(resultsRes.items || []);
      setUsers(dirRes.users || optRes.users || []);
    } catch (err) {
      onError(err.message);
    }
  }

  useEffect(() => {
    loadData();
  }, [view]);

  useEffect(() => {
    if (view === "calendar") setActiveTab("calendar");
    else if (view === "results" || view === "test-results") setActiveTab("results");
    else if (view === "plans" || view === "test-plans") setActiveTab("plans");
    else if (view === "comparison") setActiveTab("comparison");
  }, [view]);

  // Derived metrics
  const totalPlans = plans.length;
  const draftPlans = plans.filter((p) => p.status === "Draft").length;
  const submittedPlans = plans.filter((p) => p.status === "Submitted").length;
  const readyPlans = plans.filter((p) => p.status === "Ready for Execution" || p.status === "Approved").length;
  const executedPlans = plans.filter((p) => p.status === "Executed" || p.status === "Closed").length;

  const totalResults = results.length;
  const passedResults = results.filter((r) => r.overallResult === "Passed").length;
  const obsResults = results.filter((r) => r.overallResult === "Passed with Observations").length;
  const failedResults = results.filter((r) => r.overallResult === "Failed").length;

  // Filtered lists
  const filteredPlans = plans.filter((p) => {
    if (planStatusFilter !== "all" && p.status !== planStatusFilter) return false;
    if (planSearch && !`${p.testPlanId} ${p.applicationName} ${p.testType}`.toLowerCase().includes(planSearch.toLowerCase())) return false;
    return true;
  });

  const filteredResults = results.filter((r) => {
    if (resultFilter !== "all" && r.overallResult !== resultFilter) return false;
    return true;
  });

  function openNewPlan() {
    setActivePlanModal({ plan: null, viewOnly: false });
  }

  function openEditPlan(plan, viewOnly = false) {
    setActivePlanModal({ plan, viewOnly });
  }

  function openExecuteDrill(plan) {
    const planToUse = plan || plans.find((p) => p.status === "Ready for Execution" || p.status === "Approved") || plans[0] || null;
    setActiveResultModal({ testPlan: planToUse, existingResult: null });
  }

  function openCompare(planId) {
    setComparePlanId(planId);
  }

  const isResultView = view === "results" || view === "test-results" || location.hash === "#test-results";
  const isPlanView = !isResultView;

  return e(
    "div",
    null,
    // Breadcrumb
    e(Crumb, {
      items: [
        { label: "ITDR", href: "#dashboard" },
        { label: "Testing & Validation", href: isPlanView ? "#test-plans" : "#test-results" },
        { label: isPlanView ? "ITDR Test Plans" : "ITDR Test Results" },
      ],
    }),

    // Page Header
    e(PageHeader, {
      kicker: isPlanView ? "Pre-Execution Preparation" : "Post-Execution Telemetry",
      title: isPlanView ? "ITDR Test Plans" : "ITDR Test Results",
      subtitle: isPlanView
        ? "Prepare and structure DR test scenarios, procedure steps with expected results, and obtain sign-off before execution."
        : "Record actual test execution results, measure achieved RTO/RPO, verify step-by-step outcomes, and assign corrective actions.",
      actions: [
        isPlanView && canEdit &&
          e("button", { key: "new-plan", type: "button", className: "secondary", onClick: openNewPlan }, e(Icon, { name: "add_task" }), "New Test Plan"),
        isResultView &&
          e("button", { key: "add-result", type: "button", className: "accent", onClick: () => openExecuteDrill(null) }, e(Icon, { name: "add" }), "Add Test Result"),
      ],
    }),

    // ========================================================
    // MODULE 1: ITDR TEST PLANS (Dedicated View)
    // ========================================================
    isPlanView &&
      e(
        "div",
        null,
        // Metric Bento for Plans
        e(
          "div",
          { className: "grid" },
          e(Metric, { label: "Total Test Plans", value: String(totalPlans), hint: "Pre-execution definitions", icon: "assignment" }),
          e(Metric, { label: "Drafting", value: String(draftPlans), hint: "In preparation", icon: "edit_note", tone: draftPlans ? "warn" : "info" }),
          e(Metric, { label: "Submitted for Approval", value: String(submittedPlans), hint: "Awaiting approver sign-off", icon: "pending", tone: submittedPlans ? "warn" : "info" }),
          e(Metric, { label: "Ready for Execution", value: String(readyPlans), hint: "Approved & scheduled", icon: "verified", tone: readyPlans ? "ok" : "info" }),
          e(Metric, { label: "Executed & Closed", value: String(executedPlans), hint: "Drill completed", icon: "task_alt", tone: "ok" })
        ),

        // Filter Bar
        e(
          "div",
          { className: "filter-bar" },
          e("input", {
            placeholder: "Search by Plan ID, application name, or type...",
            value: planSearch,
            onChange: (ev) => setPlanSearch(ev.target.value),
            style: { minWidth: "280px" },
          }),
          e(
            "select",
            { value: planStatusFilter, onChange: (ev) => setPlanStatusFilter(ev.target.value) },
            e("option", { value: "all" }, "All Plan Statuses"),
            e("option", { value: "Draft" }, "Draft"),
            e("option", { value: "Submitted" }, "Submitted"),
            e("option", { value: "Approved" }, "Approved"),
            e("option", { value: "Ready for Execution" }, "Ready for Execution"),
            e("option", { value: "Executed" }, "Executed"),
            e("option", { value: "Closed" }, "Closed")
          ),
          e("button", { type: "button", className: "secondary", onClick: openNewPlan }, e(Icon, { name: "add" }), "Prepare New Test Plan")
        ),

        // Test Plans Table
        e(
          "article",
          { className: "card" },
          e(
            "div",
            { className: "card-toolbar" },
            e("h2", null, "ITDR Test Plans (Pre-Execution Master Registry)"),
            e("span", { className: "chip" }, `${filteredPlans.length} of ${plans.length} Test Plans`)
          ),
          e(
            "table",
            { className: "clickable" },
            e(
              "thead",
              null,
              e(
                "tr",
                null,
                e("th", null, "Test Plan ID"),
                e("th", null, "Application & Scope"),
                e("th", null, "Test Type"),
                e("th", null, "Recovery Strategy"),
                e("th", null, "Planned Date & Window"),
                e("th", null, "Target RTO / RPO"),
                e("th", null, "Steps"),
                e("th", null, "Status"),
                e("th", { style: { textAlign: "right" } }, "Actions")
              )
            ),
            e(
              "tbody",
              null,
              filteredPlans.length === 0
                ? e("tr", null, e("td", { colSpan: 9, className: "muted", style: { textAlign: "center", padding: "32px" } }, "No test plans match the selected filters."))
                : filteredPlans.map((p) =>
                    e(
                      "tr",
                      { key: p.testPlanId, onClick: () => openEditPlan(p, false) },
                      e("td", null, e("span", { className: "ci-id" }, p.testPlanId)),
                      e(
                        "td",
                        null,
                        e("div", { className: "app-cell" },
                          e("strong", null, p.applicationName),
                          e("span", null, p.businessUnit || "Enterprise IT")
                        )
                      ),
                      e("td", null, e("span", { className: "chip" }, p.testType)),
                      e("td", null, p.recoveryStrategy || "—"),
                      e("td", null, `${p.plannedTestDate || "—"} (${p.plannedStartTime || "02:00"} - ${p.plannedEndTime || "06:00"})`),
                      e("td", null, `${formatMins(p.targetRtoMinutes)} / ${formatMins(p.targetRpoMinutes)}`),
                      e("td", null, `${p.steps?.length || 0} steps`),
                      e(
                        "td",
                        null,
                        e(
                          "span",
                          {
                            className: `status-pill kind-${
                              p.status === "Ready for Execution" || p.status === "Approved"
                                ? "approved"
                                : p.status === "Submitted"
                                ? "review"
                                : p.status === "Executed"
                                ? "published"
                                : "draft"
                            }`,
                          },
                          p.status
                        )
                      ),
                      e(
                        "td",
                        { style: { textAlign: "right" }, onClick: (ev) => ev.stopPropagation() },
                        e(
                          "div",
                          { style: { display: "inline-flex", gap: "6px" } },
                          p.status === "Ready for Execution" && canExecute &&
                            e("button", { type: "button", className: "accent", style: { height: "28px", padding: "0 8px", fontSize: "11.5px" }, onClick: () => openExecuteDrill(p), title: "Execute Test" }, e(Icon, { name: "play_arrow" }), "Execute"),
                          p.status === "Submitted" && canApprove &&
                            e("button", { type: "button", className: "secondary", style: { height: "28px", padding: "0 8px", fontSize: "11.5px" }, onClick: () => openEditPlan(p, false), title: "Review & Approve" }, e(Icon, { name: "verified" }), "Review"),
                          p.status === "Executed" &&
                            e("button", { type: "button", className: "secondary", style: { height: "28px", padding: "0 8px", fontSize: "11.5px" }, onClick: () => openCompare(p.testPlanId), title: "View Comparison" }, e(Icon, { name: "compare_arrows" }), "Compare"),
                          e("button", { type: "button", className: "secondary", style: { height: "28px", padding: "0 8px", fontSize: "11.5px" }, onClick: () => openEditPlan(p, false) }, e(Icon, { name: "visibility" }))
                        )
                      )
                    )
                  )
            )
          )
        )
      ),

    // ========================================================
    // MODULE 2: ITDR TEST EXECUTION RESULTS (Dedicated View)
    // ========================================================
    isResultView &&
      e(
        "div",
        null,
        // Metric Bento for Results
        e(
          "div",
          { className: "grid" },
          e(Metric, { label: "Total Executions", value: String(totalResults), hint: "Logged test results", icon: "fact_check" }),
          e(Metric, { label: "Passed (Full Met)", value: String(passedResults), hint: "RTO & RPO attained", icon: "check_circle", tone: "ok" }),
          e(Metric, { label: "Passed with Observations", value: String(obsResults), hint: "Minor issues noted", icon: "warning", tone: obsResults ? "warn" : "info" }),
          e(Metric, { label: "Failed / Breached", value: String(failedResults), hint: "Remedial action required", icon: "error", tone: failedResults ? "danger" : "ok" })
        ),

        // Filter Bar
        e(
          "div",
          { className: "filter-bar" },
          e(
            "select",
            { value: resultFilter, onChange: (ev) => setResultFilter(ev.target.value) },
            e("option", { value: "all" }, "All Execution Results"),
            e("option", { value: "Passed" }, "Passed"),
            e("option", { value: "Passed with Observations" }, "Passed with Observations"),
            e("option", { value: "Failed" }, "Failed")
          ),
          e("button", {
            type: "button",
            className: "accent",
            onClick: () => openExecuteDrill(null),
          }, e(Icon, { name: "add" }), "Add Test Result")
        ),

        // Results Table
        e(
          "article",
          { className: "card" },
          e(
            "div",
            { className: "card-toolbar" },
            e("h2", null, "ITDR Test Execution Results Registry"),
            e("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
              e("span", { className: "chip" }, `${filteredResults.length} Result Records`),
              e("button", {
                type: "button",
                className: "secondary",
                style: { height: "30px", fontSize: "12px" },
                onClick: () => openExecuteDrill(null),
              }, e(Icon, { name: "add" }), "Add Test Result")
            )
          ),
          e(
            "table",
            { className: "clickable" },
            e(
              "thead",
              null,
              e(
                "tr",
                null,
                e("th", null, "Result ID"),
                e("th", null, "Linked Test Plan"),
                e("th", null, "Application"),
                e("th", null, "Execution Date & Window"),
                e("th", null, "Actual Recovery Time (RTO)"),
                e("th", null, "Actual RPO Achieved"),
                e("th", null, "Overall Result"),
                e("th", null, "Remedial Actions"),
                e("th", { style: { textAlign: "right" } }, "Actions")
              )
            ),
            e(
              "tbody",
              null,
              filteredResults.length === 0
                ? e("tr", null, e("td", { colSpan: 9, className: "muted", style: { textAlign: "center", padding: "32px" } }, "No test execution results logged yet. Click 'Add Test Result' above to record actual DR drill outcomes."))
                : filteredResults.map((r) =>
                    e(
                      "tr",
                      { key: r.resultId, onClick: () => openCompare(r.testPlanId) },
                      e("td", null, e("span", { className: "ci-id" }, r.resultId)),
                      e("td", null, e("span", { className: "chip" }, r.testPlanId)),
                      e("td", null, e("strong", null, r.applicationName)),
                      e("td", null, `${r.actualTestDate} (${r.actualStartTime} - ${r.actualEndTime})`),
                      e("td", null, formatMins(r.actualRecoveryTimeMinutes)),
                      e("td", null, formatMins(r.actualRpoAchievedMinutes)),
                      e(
                        "td",
                        null,
                        e(
                          "span",
                          {
                            className: `status-pill kind-${
                              r.overallResult === "Passed" ? "approved" : r.overallResult === "Failed" ? "fail" : "review"
                            }`,
                          },
                          r.overallResult
                        )
                      ),
                      e("td", null, `${r.correctiveActions?.length || 0} Actions`),
                      e(
                        "td",
                        { style: { textAlign: "right" }, onClick: (ev) => ev.stopPropagation() },
                        e(
                          "div",
                          { style: { display: "inline-flex", gap: "6px" } },
                          e("button", { type: "button", className: "secondary", style: { height: "28px", padding: "0 8px", fontSize: "11.5px" }, onClick: () => openCompare(r.testPlanId) }, e(Icon, { name: "compare_arrows" }), "Compare Expected vs Actual"),
                          e("button", { type: "button", className: "secondary", style: { height: "28px", padding: "0 8px", fontSize: "11.5px" }, onClick: () => {
                            const p = plans.find((x) => x.testPlanId === r.testPlanId);
                            setActiveResultModal({ testPlan: p, existingResult: r });
                          } }, e(Icon, { name: "edit" }))
                        )
                      )
                    )
                  )
            )
          )
        )
      ),

    // Expected vs Actual Comparison Modal Overlay
    comparePlanId &&
      e(
        "div",
        { className: "modal-backdrop", style: { position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.75)", zIndex: 1000, overflowY: "auto", padding: "32px 16px", display: "flex", justifyContent: "center" } },
        e(
          "div",
          { className: "card", style: { maxWidth: "1100px", width: "100%", maxHeight: "90vh", overflowY: "auto", margin: "auto", position: "relative" } },
          e(
            "div",
            { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid var(--line-soft)", paddingBottom: "12px" } },
            e("div", null,
              e("h2", { style: { margin: 0 } }, "Expected vs Actual Comparison"),
              e("p", { className: "muted", style: { margin: "4px 0 0" } }, "Automated SLA evaluation and side-by-side procedure verification.")
            ),
            e("button", { type: "button", className: "secondary", onClick: () => setComparePlanId("") }, e(Icon, { name: "close" }), "Close Comparison")
          ),
          e(ComparisonView, {
            testPlans: plans,
            defaultPlanId: comparePlanId || plans[0]?.testPlanId,
            onError,
            onRecordResult: (p) => openExecuteDrill(p),
          })
        )
      ),

    // Modals
    activePlanModal &&
      e(TestPlanModal, {
        plan: activePlanModal.plan,
        catalog,
        users,
        session,
        viewOnly: activePlanModal.viewOnly,
        onClose: () => setActivePlanModal(null),
        onSave: (saved) => {
          loadData();
          setActivePlanModal(null);
        },
        onApprove: (approved) => {
          loadData();
        },
        onReject: (rejected) => {
          loadData();
        },
      }),

    activeResultModal &&
      e(TestResultModal, {
        testPlan: activeResultModal.testPlan,
        availablePlans: plans,
        existingResult: activeResultModal.existingResult,
        session,
        onClose: () => setActiveResultModal(null),
        onSave: (saved) => {
          loadData();
          setActiveResultModal(null);
          setComparePlanId(saved.testPlanId);
        },
      })
  );
}
