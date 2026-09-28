import { e, useState, useEffect, api, Icon, StatusPill, pretty, minutesToHhmm } from "./core.js";

function formatMins(m) {
  if (m == null) return "—";
  const n = Number(m);
  if (!Number.isFinite(n)) return "—";
  if (n < 60) return `${n} mins`;
  const h = Math.floor(n / 60);
  const min = n % 60;
  return min ? `${h}h ${min}m` : `${h}h`;
}

export function ComparisonView({ testPlans, defaultPlanId, onError, onRecordResult }) {
  const [selectedPlanId, setSelectedPlanId] = useState(defaultPlanId || testPlans?.[0]?.testPlanId || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedPlanId && testPlans?.length > 0) {
      setSelectedPlanId(testPlans[0].testPlanId);
    }
  }, [testPlans]);

  useEffect(() => {
    if (!selectedPlanId) return;
    setLoading(true);
    api(`/api/testing/plans/${encodeURIComponent(selectedPlanId)}/comparison`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        onError(err.message);
        setLoading(false);
      });
  }, [selectedPlanId]);

  if (!testPlans || testPlans.length === 0) {
    return e(
      "div",
      { className: "card empty" },
      e(Icon, { name: "compare_arrows" }),
      e("p", null, "No ITDR Test Plans available to compare. Please create a Test Plan first.")
    );
  }

  const { testPlan, testResult, summary, stepComparisons, correctiveActions, issuesObservations, deviationFromPlan, rootCause } = data || {};

  return e(
    "div",
    null,
    // Selector Bar
    e(
      "div",
      { className: "card", style: { padding: "16px 20px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" } },
      e(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "12px" } },
        e("strong", null, "Select ITDR Test Plan:"),
        e(
          "select",
          {
            value: selectedPlanId,
            onChange: (ev) => setSelectedPlanId(ev.target.value),
            style: { minWidth: "320px", fontWeight: 600 },
          },
          testPlans.map((p) =>
            e("option", { key: p.testPlanId, value: p.testPlanId }, `${p.testPlanId} - ${p.applicationName} (${p.testType}) [${p.status}]`)
          )
        )
      ),
      e(
        "div",
        { style: { display: "flex", gap: "8px", alignItems: "center" } },
        testPlan && e("span", { className: `status-pill kind-${testPlan.status === "Ready for Execution" || testPlan.status === "Approved" ? "approved" : testPlan.status === "Executed" ? "published" : "draft"}` }, `Plan: ${testPlan.status}`),
        testResult && e("span", { className: `status-pill kind-${testResult.overallResult === "Passed" ? "approved" : testResult.overallResult === "Failed" ? "fail" : "review"}` }, `Execution: ${testResult.overallResult}`),
        !testResult && onRecordResult && testPlan &&
          e("button", { type: "button", className: "accent", onClick: () => onRecordResult(testPlan) }, e(Icon, { name: "play_arrow" }), "Execute / Record Result")
      )
    ),

    loading && e("p", { className: "muted" }, "Loading Expected vs Actual comparison…"),

    !loading && data &&
      e(
        "div",
        null,
        // High Level KPI Delta Bento
        e(
          "div",
          { className: "grid", style: { marginBottom: "20px" } },
          // RTO Card
          e(
            "article",
            { className: `metric tone-${summary.rto.status === "Met" ? "ok" : summary.rto.status === "Breached" ? "danger" : "info"}` },
            e(
              "div",
              null,
              e("div", { className: "metric-label" }, "Recovery Time (RTO)"),
              e("div", { className: "kpi" }, summary.rto.actualMinutes != null ? formatMins(summary.rto.actualMinutes) : "Pending"),
              e("div", { className: "muted" }, `Target planned: ${formatMins(summary.rto.plannedMinutes)}`),
              e(
                "div",
                { className: "metric-foot" },
                e("strong", null, summary.rto.status),
                summary.rto.varianceMinutes != null &&
                  e("span", null, `(${summary.rto.varianceMinutes <= 0 ? `${Math.abs(summary.rto.varianceMinutes)}m faster` : `${summary.rto.varianceMinutes}m breach`})`)
              )
            ),
            e("div", { className: "metric-icon" }, e(Icon, { name: summary.rto.status === "Met" ? "timer" : "timer_off" }))
          ),

          // RPO Card
          e(
            "article",
            { className: `metric tone-${summary.rpo.status === "Met" ? "ok" : summary.rpo.status === "Breached" ? "danger" : "info"}` },
            e(
              "div",
              null,
              e("div", { className: "metric-label" }, "Data Loss Window (RPO)"),
              e("div", { className: "kpi" }, summary.rpo.actualMinutes != null ? formatMins(summary.rpo.actualMinutes) : "Pending"),
              e("div", { className: "muted" }, `Target planned: ${formatMins(summary.rpo.plannedMinutes)}`),
              e(
                "div",
                { className: "metric-foot" },
                e("strong", null, summary.rpo.status),
                summary.rpo.varianceMinutes != null &&
                  e("span", null, `(${summary.rpo.varianceMinutes <= 0 ? `${Math.abs(summary.rpo.varianceMinutes)}m within SLA` : `${summary.rpo.varianceMinutes}m data loss breach`})`)
              )
            ),
            e("div", { className: "metric-icon" }, e(Icon, { name: summary.rpo.status === "Met" ? "cloud_done" : "cloud_sync" }))
          ),

          // Step Pass Rate Card
          e(
            "article",
            { className: `metric tone-${summary.stepStats.passRatePercent === 100 ? "ok" : summary.stepStats.failed > 0 ? "danger" : "info"}` },
            e(
              "div",
              null,
              e("div", { className: "metric-label" }, "Step Pass Rate"),
              e("div", { className: "kpi" }, testResult ? `${summary.stepStats.passRatePercent}%` : "—"),
              e("div", { className: "muted" }, `${summary.stepStats.passed} of ${summary.stepStats.total} steps passed`),
              e("div", { className: "metric-foot" }, e("span", null, `${summary.stepStats.failed} failed steps`))
            ),
            e("div", { className: "metric-icon" }, e(Icon, { name: "task_alt" }))
          ),

          // Overall Outcome
          e(
            "article",
            { className: `metric tone-${summary.overallResult === "Passed" ? "ok" : summary.overallResult === "Failed" ? "danger" : "warn"}` },
            e(
              "div",
              null,
              e("div", { className: "metric-label" }, "Overall Drill Result"),
              e("div", { className: "kpi", style: { fontSize: "20px" } }, summary.overallResult),
              e("div", { className: "muted" }, testResult ? `Recorded: ${testResult.actualTestDate}` : "Execution pending"),
              e("div", { className: "metric-foot" }, e("span", null, testResult ? `By: ${testResult.recordedBy}` : "Awaiting drill run"))
            ),
            e("div", { className: "metric-icon" }, e(Icon, { name: "verified" }))
          )
        ),

        // Parameter Level Expected vs Actual Table
        e(
          "article",
          { className: "card", style: { marginBottom: "20px" } },
          e(
            "div",
            { className: "card-toolbar" },
            e("h2", null, "SLA & Parameter Comparison (Expected vs Actual)"),
            e("span", { className: "chip" }, testPlan.applicationName)
          ),
          e(
            "table",
            null,
            e(
              "thead",
              null,
              e(
                "tr",
                null,
                e("th", null, "Parameter"),
                e("th", null, "Planned / Expected Target"),
                e("th", null, "Actual Result Achieved"),
                e("th", null, "Variance / Delta"),
                e("th", null, "Status")
              )
            ),
            e(
              "tbody",
              null,
              e(
                "tr",
                null,
                e("td", null, e("strong", null, "Recovery Time Objective (RTO)")),
                e("td", null, formatMins(testPlan.targetRtoMinutes)),
                e("td", null, testResult ? formatMins(testResult.actualRecoveryTimeMinutes) : e("span", { className: "muted" }, "Pending")),
                e("td", null, summary.rto.varianceMinutes != null ? (summary.rto.varianceMinutes <= 0 ? `-${Math.abs(summary.rto.varianceMinutes)} mins (Ahead)` : `+${summary.rto.varianceMinutes} mins (Delayed)`) : "—"),
                e("td", null, e("span", { className: `status-pill kind-${summary.rto.status === "Met" ? "approved" : summary.rto.status === "Breached" ? "fail" : "neutral"}` }, summary.rto.status))
              ),
              e(
                "tr",
                null,
                e("td", null, e("strong", null, "Recovery Point Objective (RPO)")),
                e("td", null, formatMins(testPlan.targetRpoMinutes)),
                e("td", null, testResult ? formatMins(testResult.actualRpoAchievedMinutes) : e("span", { className: "muted" }, "Pending")),
                e("td", null, summary.rpo.varianceMinutes != null ? (summary.rpo.varianceMinutes <= 0 ? `-${Math.abs(summary.rpo.varianceMinutes)} mins (Within SLA)` : `+${summary.rpo.varianceMinutes} mins (Data Loss)`) : "—"),
                e("td", null, e("span", { className: `status-pill kind-${summary.rpo.status === "Met" ? "approved" : summary.rpo.status === "Breached" ? "fail" : "neutral"}` }, summary.rpo.status))
              ),
              e(
                "tr",
                null,
                e("td", null, e("strong", null, "Recovery Environment / DR Site")),
                e("td", null, testPlan.recoveryEnvironment || "Secondary Site"),
                e("td", null, testResult ? testPlan.recoveryEnvironment : e("span", { className: "muted" }, "Pending")),
                e("td", null, "Matched planned target site"),
                e("td", null, e("span", { className: `status-pill kind-${testResult ? "approved" : "neutral"}` }, testResult ? "Verified" : "Pending"))
              ),
              e(
                "tr",
                null,
                e("td", null, e("strong", null, "Test Execution Window")),
                e("td", null, `${testPlan.plannedTestDate || "—"} (${testPlan.plannedStartTime} - ${testPlan.plannedEndTime})`),
                e("td", null, testResult ? `${testResult.actualTestDate} (${testResult.actualStartTime} - ${testResult.actualEndTime})` : e("span", { className: "muted" }, "Pending")),
                e("td", null, testResult ? "Executed in scheduled change window" : "—"),
                e("td", null, e("span", { className: `status-pill kind-${testResult ? "approved" : "neutral"}` }, testResult ? "Completed" : "Scheduled"))
              )
            )
          )
        ),

        // Step-by-Step Expected vs Actual Matrix
        e(
          "article",
          { className: "card", style: { marginBottom: "20px" } },
          e(
            "div",
            { className: "card-toolbar" },
            e("h2", null, "Step-by-Step Execution Verification"),
            e("span", { className: "chip" }, `${summary.stepStats.passed} / ${summary.stepStats.total} Steps Passed`)
          ),
          e(
            "table",
            null,
            e(
              "thead",
              null,
              e(
                "tr",
                null,
                e("th", { style: { width: "60px" } }, "Step #"),
                e("th", null, "Procedure / Step Title"),
                e("th", null, "Assignee"),
                e("th", null, "Planned Expected Result"),
                e("th", null, "Actual Result Achieved"),
                e("th", null, "Duration"),
                e("th", null, "Step Status")
              )
            ),
            e(
              "tbody",
              null,
              stepComparisons.map((sc) =>
                e(
                  "tr",
                  { key: sc.stepNumber },
                  e("td", null, e("strong", null, sc.stepNumber)),
                  e("td", null,
                    e("strong", null, sc.stepTitle),
                    sc.procedure && e("div", { className: "muted", style: { fontSize: "11.5px", marginTop: "2px" } }, sc.procedure)
                  ),
                  e("td", null, sc.assigneeRole || "—"),
                  e("td", { style: { maxWidth: "240px" } }, sc.expectedResult || "—"),
                  e("td", { style: { maxWidth: "240px", color: sc.stepStatus === "Failed" ? "var(--danger)" : "inherit", fontWeight: sc.stepStatus === "Failed" ? 600 : 400 } },
                    sc.actualResult || e("span", { className: "muted" }, "Pending execution")
                  ),
                  e("td", null, sc.durationMinutes != null ? `${sc.durationMinutes}m` : "—"),
                  e("td", null,
                    e("span", { className: `status-pill kind-${sc.stepStatus === "Passed" ? "approved" : sc.stepStatus === "Failed" ? "fail" : sc.stepStatus === "Not Executed" ? "draft" : "neutral"}` },
                      sc.stepStatus
                    )
                  )
                )
              )
            )
          )
        ),

        // Observations, Deviations & Remedial Actions
        testResult &&
          e(
            "div",
            { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" } },
            e(
              "article",
              { className: "card" },
              e("h3", null, "Drill Observations & Deviations"),
              e("div", { style: { marginBottom: "12px" } },
                e("div", { className: "meta-label" }, "Issues / Observations:"),
                e("p", { style: { margin: "2px 0", fontSize: "13px" } }, issuesObservations || "None recorded.")
              ),
              e("div", { style: { marginBottom: "12px" } },
                e("div", { className: "meta-label" }, "Deviation from Test Plan:"),
                e("p", { style: { margin: "2px 0", fontSize: "13px" } }, deviationFromPlan || "None. Executed according to procedure.")
              ),
              e("div", null,
                e("div", { className: "meta-label" }, "Root Cause Analysis:"),
                e("p", { style: { margin: "2px 0", fontSize: "13px" } }, rootCause || "N/A.")
              )
            ),

            e(
              "article",
              { className: "card" },
              e(
                "div",
                { className: "card-toolbar", style: { padding: 0, marginBottom: "12px", border: "none" } },
                e("h3", { style: { margin: 0 } }, "Corrective & Remedial Actions"),
                e("span", { className: "chip" }, `${correctiveActions.length} Actions`)
              ),
              correctiveActions.length === 0 &&
                e("p", { className: "muted", style: { fontStyle: "italic" } }, "No corrective actions required for this drill run."),
              correctiveActions.length > 0 &&
                e(
                  "table",
                  null,
                  e(
                    "thead",
                    null,
                    e("tr", null, e("th", null, "ID"), e("th", null, "Action"), e("th", null, "Owner"), e("th", null, "Target Date"), e("th", null, "Status"))
                  ),
                  e(
                    "tbody",
                    null,
                    correctiveActions.map((act) =>
                      e(
                        "tr",
                        { key: act.actionId },
                        e("td", null, e("span", { className: "ci-id" }, act.actionId)),
                        e("td", null, act.actionDescription),
                        e("td", null, act.actionOwner),
                        e("td", null, act.targetClosureDate),
                        e("td", null, e("span", { className: `status-pill kind-${act.actionStatus === "Closed" ? "approved" : act.actionStatus === "In Progress" ? "review" : "fail"}` }, act.actionStatus))
                      )
                    )
                  )
                )
            )
          )
      )
  );
}
