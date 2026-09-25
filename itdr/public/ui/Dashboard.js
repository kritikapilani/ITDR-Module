import { e, useState, useEffect, api, Pill, PageHeader, Metric, Icon, Crumb, pretty } from "./core.js";

const KPI_META = {
  currentPlans: { stitch: "Approved DR Plan Ratio", icon: "assignment", foot: (k) => [`${k.numerator} approved`, `${Math.max(0, k.denominator - k.numerator)} remaining`] },
  testedInWindow: { stitch: "Testing Window Policy", icon: "history_toggle_off", foot: (k) => [`${k.numerator} valid`, `${Math.max(0, k.denominator - k.numerator)} outside window`] },
  testedMeetingRtoRpo: { stitch: "RTO/RPO SLA Compliance", icon: "timelapse", foot: (k) => [`${k.numerator} within SLA`, `${Math.max(0, k.denominator - k.numerator)} breached`] },
};

export function Dashboard({ filter, onError, query }) {
  const [data, setData] = useState(null);
  const [tier, setTier] = useState("all");
  const [status, setStatus] = useState("all");
  useEffect(() => {
    api("/api/itdr/dashboard").then(setData).catch((err) => onError(err.message));
  }, []);
  if (!data) return e("p", { className: "muted" }, "Loading dashboard…");
  const kpis = Object.values(data.kpis || {});
  const remCount = (data.remediations || []).length;
  const recert = (data.overdueRecertifications || []).length;
  const q = (query || "").toLowerCase();
  let members = data.rows || [];
  if (filter && data.kpis[filter]) {
    const ids = new Set((data.kpis[filter].members || []).map((m) => m.biaApplicationId));
    members = members.filter((r) => ids.has(r.biaApplicationId));
  }
  members = members.filter((r) => {
    if (q && !`${r.name} ${r.biaApplicationId}`.toLowerCase().includes(q)) return false;
    if (tier !== "all" && String(r.tier) !== tier) return false;
    const st = r.readiness?.status || r.status;
    if (status !== "all" && st !== status) return false;
    return true;
  });
  return e(
    "div",
    null,
    e(PageHeader, {
      kicker: "Real-time audit",
      title: "ITDR Readiness Dashboard",
      subtitle: "Continuous visibility into application resilience, compliance posture, and disaster recovery plan health across Tier 0–3 systems.",
      actions: [
        e("button", { key: "pdf", type: "button", className: "secondary" }, e(Icon, { name: "picture_as_pdf" }), "Export Dashboard PDF"),
        e("button", { key: "run", type: "button", onClick: () => { location.hash = "#audit"; } }, e(Icon, { name: "verified" }), "Run Compliance Check"),
      ],
    }),
    e("div", { className: "grid" },
      kpis.map((k) => {
        const meta = KPI_META[k.id] || { stitch: k.label, icon: "speed", foot: () => [`${k.numerator} of ${k.denominator}`] };
        return e("article", { className: "metric", key: k.id, style: { cursor: "pointer" }, onClick: () => { location.hash = `#dashboard/${k.id}`; } },
          e("div", { style: { flex: 1 } },
            e("div", { className: "metric-label" }, meta.stitch),
            e("div", { className: "kpi" }, k.percent == null ? "—" : `${k.percent}%`),
            e("div", { className: "muted" }, `${k.numerator} / ${k.denominator} total apps`),
            e("div", { className: "metric-foot" }, meta.foot(k).map((f, i) => [i ? e("span", { key: `d${i}` }, "·") : null, e("span", { key: f }, f)]))
          ),
          e("div", { className: "metric-icon" }, e(Icon, { name: meta.icon }))
        );
      }),
      e("article", { className: `metric${remCount ? " tone-danger" : " tone-ok"}` },
        e("div", { style: { flex: 1 } },
          e("div", { className: "metric-label" }, "Remediation Action Gaps"),
          e("div", { className: "kpi" }, String(remCount)),
          e("div", { className: "muted" }, "Active remediation tickets"),
          e("div", { className: "metric-foot" }, e("span", null, e("strong", null, String(recert)), " due for recertification"))
        ),
        e("div", { className: "metric-icon" }, e(Icon, { name: "assignment_late" }))
      )
    ),
    e("div", { className: "filter-bar" },
      e("input", { placeholder: "Search by application name, ID, or CI...", value: query || "", readOnly: true, title: "Use the top search bar" }),
      e("select", { value: tier, onChange: (ev) => setTier(ev.target.value) },
        e("option", { value: "all" }, "Criticality: All Tiers"),
        e("option", { value: "1" }, "Tier 1"),
        e("option", { value: "2" }, "Tier 2"),
        e("option", { value: "3" }, "Tier 3")
      ),
      e("select", { value: status, onChange: (ev) => setStatus(ev.target.value) },
        e("option", { value: "all" }, "Status: All Statuses"),
        ["ready", "approved_untested", "failed_test", "expired", "bia_drift", "not_started"].map((s) => e("option", { key: s, value: s }, pretty(s)))
      ),
      filter ? e("button", { type: "button", className: "secondary", onClick: () => { location.hash = "#dashboard"; } }, "Clear KPI filter") : null
    ),
    e("article", { className: "card" },
      e("div", { className: "card-toolbar" },
        e("div", null,
          e("h2", { style: { margin: 0 } }, filter && data.kpis[filter] ? (KPI_META[filter]?.stitch || data.kpis[filter].label) : "Monitored application ecosystem"),
          e("span", { className: "chip" }, `${members.length} of ${(data.rows || []).length} systems`)
        ),
        e("span", { className: "muted" }, e("span", { className: "dot" }), " Live telemetry feeds active")
      ),
      e("table", { className: "clickable" },
        e("thead", null, e("tr", null,
          e("th", null, "Application & ID"), e("th", null, "Tier"), e("th", null, "Status"),
          e("th", null, "Plan version"), e("th", null, "Last test")
        )),
        e("tbody", null,
          members.length
            ? members.map((r) =>
                e("tr", { key: r.biaApplicationId, onClick: () => { location.hash = `#target/${r.biaApplicationId}`; } },
                  e("td", null, e("div", { className: "app-cell" }, e("strong", null, r.name || r.biaApplicationId), e("span", null, r.biaApplicationId))),
                  e("td", null, e("span", { className: "chip" }, `Tier ${r.tier ?? "—"}`)),
                  e("td", null, e(Pill, { status: r.status || r.readiness?.status })),
                  e("td", null, r.evidence?.planVersionId || r.readiness?.evidence?.planVersionId || r.currentApprovedVersionId || "—"),
                  e("td", null, r.evidence?.testId || r.readiness?.evidence?.testId || "—")
                )
              )
            : e("tr", null, e("td", { colSpan: 5, className: "muted" }, "None"))
        )
      )
    )
  );
}

export function Approvals({ onError }) {
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState("");
  async function load() {
    setData(await api("/api/itdr/approvals"));
  }
  useEffect(() => {
    load().catch((err) => onError(err.message));
  }, []);
  if (!data) return e("p", { className: "muted" }, "Loading inbox…");
  const items = data.items || [];
  const current = items[0];
  return e(
    "div",
    null,
    e(Crumb, { items: [{ label: "Recovery operations", href: "#dashboard" }, { label: "Plan Approvals" }] }),
    e(PageHeader, {
      kicker: current ? current.versionId : "Inbox",
      title: current ? `DR Plan Approval & Technical Review: ${current.name}` : "Plan Approvals",
      subtitle: current
        ? `Submitted by ${current.submittedBy} on ${current.submittedAt || "—"}. Author cannot approve their own draft.`
        : "Mandatory sign-off before a DR plan is published.",
    }),
    items.length
      ? e("div", { className: "action-banner" },
          e("strong", null, e(Icon, { name: "assignment_late" }), " Action required: pending sign-off"),
          e("p", { className: "sub", style: { color: "#d5e3fd" } }, `${items.length} plan(s) waiting. Segregation of duties is enforced.`)
        )
      : null,
    e("article", { className: "card" },
      e("h2", null, "Governance approval chain"),
      e("table", null,
        e("thead", null, e("tr", null, e("th", null, "Application"), e("th", null, "Plan"), e("th", null, "Submitted by"), e("th", null, "When"), e("th", null, ""))),
        e("tbody", null,
          items.length
            ? items.map((i) =>
                e("tr", { key: i.versionId },
                  e("td", null, e("a", { href: `#target/${i.biaApplicationId}/runbook` }, i.name)),
                  e("td", null, e("div", { className: "app-cell" }, e("strong", null, i.title), e("span", null, i.versionId))),
                  e("td", null, i.submittedBy),
                  e("td", null, i.submittedAt || ""),
                  e("td", null,
                    e("button", { type: "button", onClick: async () => { await api(`/api/itdr/versions/${i.versionId}/approve`, { method: "POST", body: JSON.stringify({ comments: notes }) }); await load(); } }, e(Icon, { name: "verified" }), "Approve"),
                    " ",
                    e("button", { type: "button", className: "secondary", onClick: async () => {
                      const comments = notes || prompt("Review comments") || "";
                      await api(`/api/itdr/versions/${i.versionId}/reject`, { method: "POST", body: JSON.stringify({ comments }) });
                      await load();
                    } }, e(Icon, { name: "block" }), "Reject")
                  )
                )
              )
            : e("tr", null, e("td", { colSpan: 5, className: "muted" }, "Nothing waiting."))
        )
      ),
      items.length
        ? e("div", { style: { marginTop: 16 } },
            e("label", { className: "field" },
              e("span", null, "Sign-off remarks & regulatory findings"),
              e("textarea", { value: notes, onChange: (ev) => setNotes(ev.target.value), placeholder: "Enter formal review notes (optional for approval, mandatory for rejection)..." })
            )
          )
        : null
    )
  );
}

export function OtherModule({ name, owner }) {
  return e("article", { className: "card other-module" },
    e("span", { className: "pill" }, "Existing BCM module"),
    e("h2", { style: { marginTop: 10 } }, name),
    e("p", { className: "muted" }, `${owner} ITDR integrates with this module; it does not replace it.`)
  );
}

export function Process({ id, onError }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api(`/api/itdr/processes/${id}`).then(setData).catch((err) => onError(err.message));
  }, [id]);
  if (!data) return e("p", { className: "muted" }, "Loading process…");
  return e("article", { className: "card" },
    e("h2", null, `Process ${data.processId}`),
    e("p", { className: "muted" }, data.note),
    e("table", { className: "clickable" },
      e("thead", null, e("tr", null, e("th", null, "Application"), e("th", null, "Status"), e("th", null, "Plan"), e("th", null, "Test"))),
      e("tbody", null,
        (data.applications || []).map((a) =>
          e("tr", { key: a.biaApplicationId, onClick: () => { location.hash = `#target/${a.biaApplicationId}`; } },
            e("td", null, a.name), e("td", null, e(Pill, { status: a.readiness?.status })),
            e("td", null, a.evidence?.planVersionId || "—"), e("td", null, a.evidence?.testId || "—")
          )
        )
      )
    )
  );
}

export function Overview({ onError }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    api("/api/itdr/status").then(setStatus).catch((err) => onError(err.message));
  }, []);
  if (!status) return null;
  return e("div", { className: "grid" },
    e("article", { className: "card" }, e("span", { className: "pill" }, "Phase 2"), e("h2", { style: { marginTop: 10 } }, "ITDR readiness"), e("p", { className: "muted" }, "Ready is derived from an in-cycle DR Test of the current approved version.")),
    e("article", { className: "card" }, e("h3", null, "Session"), e("p", { className: "muted" }, `${status.session?.displayName || ""} · ${status.session?.role}`)),
    e("article", { className: "card" }, e("h3", null, "Out of this phase"), e("p", { className: "muted" }, "No user-set ready flag, no Crisis invoke, ISO pack is Phase 3."))
  );
}

export function JsonPage({ path, onError }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api(path).then(setData).catch((err) => onError(err.message));
  }, [path]);
  if (!data) return e("p", { className: "muted" }, "Loading…");
  if (path === "/api/itdr/audit") {
    return e("div", null,
      e(Crumb, { items: [{ label: "Governance", href: "#dashboard" }, { label: "Compliance & Audit Reports" }] }),
      e(PageHeader, {
        kicker: "Cycle: live ledger",
        title: "Disaster Recovery Regulatory & Audit Compliance",
        subtitle: "Approvals, overrides, and assignment trail. Continuous attestation mapping is Phase 3 ISO pack.",
        actions: [e("button", { key: "ex", type: "button", className: "secondary" }, e(Icon, { name: "file_download" }), "Export audit dossier")],
      }),
      e("div", { className: "grid" },
        e(Metric, { label: "Ledger entries", value: String((data.entries || []).length), hint: "This session", icon: "policy" }),
        e(Metric, { label: "Framework pack", value: "Phase 3", hint: "ISO 22301 / 27031 deferred", icon: "fact_check", tone: "info" })
      ),
      e("article", { className: "card", style: { marginTop: 16 } },
        e("h2", null, "Immutable evidence store"),
        e("table", null,
          e("thead", null, e("tr", null, e("th", null, "When"), e("th", null, "Actor"), e("th", null, "Action"), e("th", null, "Detail"))),
          e("tbody", null, (data.entries || []).slice(0, 50).map((row, i) =>
            e("tr", { key: i }, e("td", null, row.at), e("td", null, row.actor), e("td", null, row.action), e("td", null, JSON.stringify(row.detail || {})))
          ))
        )
      )
    );
  }
  return e("div", null,
    e(PageHeader, { kicker: "Governance", title: "Settings", subtitle: "Sprint 0 decisions still in force." }),
    e("article", { className: "card" }, e("pre", null, JSON.stringify(data, null, 2)))
  );
}
