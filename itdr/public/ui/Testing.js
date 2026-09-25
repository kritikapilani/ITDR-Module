import { e, useState, useEffect, api, PageHeader, Metric, Icon, Crumb, Pill, pretty, minutesToHhmm } from "./core.js";
import { ScheduleTestModal, RecordResultModal } from "./TestModal.js";

export function Testing({ session, onError, view, focusTestId }) {
  const [catalog, setCatalog] = useState(null);
  const [tests, setTests] = useState([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultTestId, setResultTestId] = useState("");

  async function load() {
    let cat;
    try {
      cat = await api("/api/testing/options");
    } catch {
      const types = await api("/api/testing/types");
      cat = { types: types.types, applications: [], users: [], catalogs: {}, exerciseModes: ["tabletop", "simulation", "full_failover"] };
    }
    const list = await api("/api/testing/tests");
    setCatalog(cat);
    setTests(list.items || []);
  }

  useEffect(() => {
    load().catch((err) => onError(err.message));
  }, []);

  if (!catalog) return e("p", { className: "muted" }, "Loading Testing…");
  const calendar = view === "calendar";
  const canSchedule = session?.role === "ADMIN" || session?.role === "TEST_MANAGER";
  const open = tests.filter((t) => t.status !== "completed");
  const completed = tests.filter((t) => t.status === "completed");
  const overdue = tests.filter((t) => t.status !== "completed" && t.dueAt && new Date(t.dueAt) < new Date());

  function openResult(testId) {
    setResultTestId(testId || "");
    setShowResult(true);
  }

  return e(
    "div",
    null,
    e(Crumb, { items: [{ label: "Testing & validation", href: "#testing" }, { label: calendar ? "Test Calendar & Schedule" : "Test Records & Results" }] }),
    calendar
      ? e(PageHeader, {
          kicker: "Testing & validation",
          title: "DR Testing Calendar & Execution Schedule",
          subtitle: "Enterprise failover cadence, regulatory simulations, and change window scheduling.",
          actions: [
            e("button", { key: "ics", type: "button", className: "secondary" }, e(Icon, { name: "file_download" }), "Export calendar"),
            canSchedule && e("button", { key: "new", type: "button", onClick: () => setShowSchedule(true) }, e(Icon, { name: "add" }), "Schedule DR Test"),
          ],
        })
      : e(PageHeader, {
          kicker: "Testing & validation",
          title: "Test Records & Results",
          subtitle: "DR Test is registered beside BCP Test. Results stay bound to the approved plan version.",
          actions: [
            canSchedule && e("button", { key: "sched", type: "button", className: "secondary", onClick: () => setShowSchedule(true) }, e(Icon, { name: "event_note" }), "Schedule DR Test"),
            canSchedule && e("button", { key: "rec", type: "button", onClick: () => openResult(open[0]?.testId) }, e(Icon, { name: "add" }), "Record result"),
          ],
        }),
    e("div", { className: "grid" },
      e(Metric, { label: "Total scheduled", value: String(tests.length), hint: "All DR / BCP tests", icon: "event_available" }),
      e(Metric, { label: "Open / queued", value: String(open.length), hint: "Awaiting result", icon: "pending_actions", tone: "info" }),
      e(Metric, { label: "Completed", value: String(completed.length), hint: "Evidence recorded", icon: "verified", tone: "ok" }),
      e(Metric, { label: "Overdue / action needed", value: String(overdue.length), hint: "Past due date", icon: "warning", tone: overdue.length ? "danger" : "ok" })
    ),
    overdue.length
      ? e("div", { className: "notice" },
          e("div", { className: "row", style: { margin: 0 } },
            e("div", { className: "notice-icon" }, e(Icon, { name: "warning" })),
            e("div", null, e("strong", null, "Overdue compliance action required: "), e("span", { className: "muted" }, `${overdue.length} drill(s) past due.`))
          ),
          e("button", { type: "button", className: "danger", onClick: () => setShowSchedule(true), disabled: !canSchedule }, e(Icon, { name: "calendar_month" }), "Schedule DR Test")
        )
      : null,
    e("article", { className: "card", style: { marginTop: 12 } },
      e("div", { className: "card-toolbar" },
        e("h2", { style: { margin: 0 } }, calendar ? "Agenda" : "Records"),
        e("div", { className: "row", style: { margin: 0 } },
          e("button", { type: "button", className: calendar ? "secondary" : "", onClick: () => { location.hash = "#testing"; } }, e(Icon, { name: "fact_check" }), "List"),
          e("button", { type: "button", className: calendar ? "" : "secondary", onClick: () => { location.hash = "#calendar"; } }, e(Icon, { name: "calendar_view_month" }), "Calendar")
        )
      ),
      e("table", { className: "clickable" },
        e("thead", null, e("tr", null,
          e("th", null, "Id"), e("th", null, "Type"), e("th", null, "Plan"), e("th", null, "Mode"), e("th", null, "Result"),
          e("th", null, "Actual RTO/RPO"), e("th", null, "Remediation"), e("th", null, "Status")
        )),
        e("tbody", null,
          tests.length
            ? tests.map((t) => e("tr", { key: t.testId, className: t.testId === focusTestId ? "row-focus" : "", onClick: () => { if (canSchedule && t.status !== "completed") openResult(t.testId); } },
                e("td", null, e("span", { className: "ci-id" }, t.testId)), e("td", null, t.testType), e("td", null, t.planVersionId || "unbound"),
                e("td", null, pretty(t.exerciseMode) || "—"), e("td", null, t.outcome ? e(Pill, { status: t.outcome === "pass" ? "ready" : t.outcome === "fail" ? "failed_test" : "in_progress" }, t.outcome) : "—"),
                e("td", null, `${minutesToHhmm(t.actualRtoMinutes) || "—"} / ${minutesToHhmm(t.actualRpoMinutes) || "—"}`),
                e("td", null, t.remediationRequired ? e("span", { className: "pill st-failed_test" }, "Yes") : "No"), e("td", null, pretty(t.status))
              ))
            : e("tr", null, e("td", { colSpan: 8, className: "muted" },
                calendar
                  ? "No tests yet. Use Schedule DR Test in the header."
                  : "No tests yet. Schedule a test, then use Record result."
              ))
        )
      )
    ),
    showSchedule && e(ScheduleTestModal, {
      catalog,
      tests,
      session,
      onClose: () => setShowSchedule(false),
      onError,
      onCreated: () => { setShowSchedule(false); load(); },
    }),
    showResult && e(RecordResultModal, {
      catalog,
      tests,
      session,
      defaultTestId: resultTestId,
      onClose: () => setShowResult(false),
      onError,
      onCreated: () => { setShowResult(false); load(); },
    })
  );
}
