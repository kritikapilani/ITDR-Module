import { e, useState, useEffect, api, Icon, StatusPill, PageHeader } from "./core.js";
import { PlanWizard } from "./PlanWizard.js";

const PLAN_STATUS = {
  published: { label: "Published", kind: "published" },
  approved: { label: "Approved", kind: "approved" },
  in_review: { label: "In Review", kind: "review" },
  draft: { label: "Draft", kind: "draft" },
  expired: { label: "Expired", kind: "expired" },
  under_remediation: { label: "Fail / Remediation", kind: "fail" },
  none: { label: "No Plan", kind: "neutral" },
};

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function ItdrLanding({ catalogs, users, session, onError, onWarn, query }) {
  const [data, setData] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [envFilter, setEnvFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [sortField, setSortField] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);

  const canEdit = ["ADMIN", "PLAN_OWNER"].includes(session?.role);
  const isAdmin = session?.role === "ADMIN";

  async function load() {
    const cov = await api("/api/itdr/coverage");
    setData(cov);
  }

  useEffect(() => {
    load().catch((err) => onError(err.message));
  }, []);

  if (!data) return e("p", { className: "muted" }, "Loading ITDR Plans & Applications…");

  const summary = data.summary || {
    totalApplications: data.rows?.length || 0,
    totalApplicationsWithPlan: (data.rows || []).filter((r) => r.hasPlan && r.planStatus !== "none").length,
    applicationsWithoutPlan: (data.rows || []).filter((r) => !r.hasPlan || r.planStatus === "none").length,
    plansByStatus: { draft: 0, in_review: 0, approved: 0, expired: 0, under_remediation: 0 },
    plansByTier: { tier1: 0, tier2: 0, tier3: 0 },
    plansOverdueReviewOrTest: 0,
  };

  const q = `${search} ${query || ""}`.trim().toLowerCase();

  // Filter rows
  let rows = (data.rows || []).filter((r) => {
    if (tierFilter !== "all" && String(r.tier) !== String(tierFilter)) return false;
    if (statusFilter !== "all") {
      if (statusFilter === "none" && r.hasPlan && r.planStatus !== "none") return false;
      if (statusFilter !== "none" && r.planStatus !== statusFilter) return false;
    }
    if (envFilter !== "all") {
      const hasEnv = (r.hosting || []).some((h) => h.environmentId === envFilter || h.environmentName?.toLowerCase() === envFilter.toLowerCase());
      if (!hasEnv) return false;
    }
    if (siteFilter !== "all") {
      const hasSite = (r.hosting || []).some((h) => h.siteId === siteFilter || h.siteName?.toLowerCase().includes(siteFilter.toLowerCase()));
      if (!hasSite) return false;
    }
    if (!q) return true;
    const hay = `${r.name} ${r.biaApplicationId} ${r.highLevelPlan || ""} ${r.hostingSummary || ""} ${r.primarySite || ""} ${r.recoverySite || ""}`.toLowerCase();
    return hay.includes(q);
  });

  // Sort rows
  rows = [...rows].sort((a, b) => {
    let av = a[sortField];
    let bv = b[sortField];
    if (sortField === "tier") {
      av = Number(a.tier || 99);
      bv = Number(b.tier || 99);
    } else if (sortField === "review") {
      av = a.nextReviewDueAt || "";
      bv = b.nextReviewDueAt || "";
    } else {
      av = String(av || "").toLowerCase();
      bv = String(bv || "").toLowerCase();
    }
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  function toggleSort(field) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  async function handleDeleteDraft(appId, ev) {
    if (ev) ev.stopPropagation();
    if (!confirm("Are you sure you want to delete this draft DR plan?")) return;
    try {
      await api(`/api/itdr/targets/${appId}/plan`, { method: "DELETE" });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  function openNewPlan(appId = null) {
    setSelectedAppId(appId);
    setShowWizard(true);
  }

  const siteList = catalogs.siteLibrary || [];
  const envList = catalogs.environmentLibrary || [];

  return e(
    "div",
    { className: "list-page itdr-landing" },
    // Header & Breadcrumb
    e("div", { className: "list-head" },
      e("div", null,
        e("nav", { className: "crumb" },
          e("a", { href: "#dashboard" }, "ITDR"),
          e("span", { className: "crumb-sep" }, ">"),
          e("span", null, "Plans")
        ),
        e("h1", { style: { display: "flex", alignItems: "center", gap: 10 } },
          e(Icon, { name: "shield" }),
          "Disaster Recovery Plans & Applications"
        ),
        e("p", { className: "sub", style: { margin: "4px 0 0" } },
          "Unified ITDR ecosystem: application topologies, verified RTO/RPO objectives, and technical recovery runbooks."
        )
      ),
      e("div", { className: "actions" },
        canEdit && e("button", {
          type: "button",
          className: "accent",
          id: "new-plan-btn",
          onClick: () => openNewPlan(),
        }, e(Icon, { name: "add" }), "New Plan")
      )
    ),

    // 1. DASHBOARD SUMMARY CARDS (Top)
    e("div", { className: "summary-cards-grid" },
      // Card 1: Total applications with a plan
      e("article", { className: "summary-card metric-interactive", onClick: () => setStatusFilter("all") },
        e("div", { className: "summary-card-head" },
          e("span", { className: "summary-card-title" }, "Applications with Plan"),
          e("div", { className: "summary-card-icon icon-primary" }, e(Icon, { name: "verified" }))
        ),
        e("div", { className: "summary-card-value" }, `${summary.totalApplicationsWithPlan} / ${summary.totalApplications}`),
        e("div", { className: "summary-card-sub" },
          e("span", { className: "highlight-pill" }, `${summary.totalApplications ? Math.round((summary.totalApplicationsWithPlan / summary.totalApplications) * 100) : 0}% covered`),
          e("span", { className: "muted" }, " across enterprise scope")
        )
      ),

      // Card 2: Plans by status
      e("article", { className: "summary-card" },
        e("div", { className: "summary-card-head" },
          e("span", { className: "summary-card-title" }, "Plans by Status"),
          e("div", { className: "summary-card-icon icon-info" }, e(Icon, { name: "donut_large" }))
        ),
        e("div", { className: "status-badges-row" },
          e("span", { className: "status-mini-badge status-approved", onClick: () => setStatusFilter("approved") }, `Approved: ${summary.plansByStatus?.approved || 0}`),
          e("span", { className: "status-mini-badge status-review", onClick: () => setStatusFilter("in_review") }, `Review: ${summary.plansByStatus?.in_review || 0}`),
          e("span", { className: "status-mini-badge status-draft", onClick: () => setStatusFilter("draft") }, `Draft: ${summary.plansByStatus?.draft || 0}`),
          summary.plansByStatus?.expired > 0 && e("span", { className: "status-mini-badge status-expired", onClick: () => setStatusFilter("expired") }, `Expired: ${summary.plansByStatus.expired}`)
        )
      ),

      // Card 3: Plans by Criticality Tier
      e("article", { className: "summary-card" },
        e("div", { className: "summary-card-head" },
          e("span", { className: "summary-card-title" }, "Plans by Criticality Tier"),
          e("div", { className: "summary-card-icon icon-tier" }, e(Icon, { name: "layers" }))
        ),
        e("div", { className: "status-badges-row" },
          e("span", { className: "status-mini-badge tier-badge-1", onClick: () => setTierFilter("1") }, `Tier 1: ${summary.plansByTier?.tier1 || 0}`),
          e("span", { className: "status-mini-badge tier-badge-2", onClick: () => setTierFilter("2") }, `Tier 2: ${summary.plansByTier?.tier2 || 0}`),
          e("span", { className: "status-mini-badge tier-badge-3", onClick: () => setTierFilter("3") }, `Tier 3: ${summary.plansByTier?.tier3 || 0}`)
        )
      ),

      // Card 4: Plans Overdue for Review or Test
      e("article", { className: `summary-card${summary.plansOverdueReviewOrTest > 0 ? " card-warn" : ""}` },
        e("div", { className: "summary-card-head" },
          e("span", { className: "summary-card-title" }, "Overdue Review / Test"),
          e("div", { className: "summary-card-icon icon-warn" }, e(Icon, { name: "schedule" }))
        ),
        e("div", { className: "summary-card-value" }, String(summary.plansOverdueReviewOrTest || 0)),
        e("div", { className: "summary-card-sub" },
          summary.plansOverdueReviewOrTest > 0
            ? e("span", { className: "danger-text" }, "Requires recertification or DR drill")
            : e("span", { className: "ok-text" }, "All plan reviews & tests in policy window")
        )
      ),

      // Card 5: Applications without a DR Plan (Gap Indicator)
      e("article", { className: `summary-card${summary.applicationsWithoutPlan > 0 ? " card-danger" : ""}`, onClick: () => setStatusFilter("none") },
        e("div", { className: "summary-card-head" },
          e("span", { className: "summary-card-title" }, "Applications Without Plan"),
          e("div", { className: "summary-card-icon icon-danger" }, e(Icon, { name: "warning" }))
        ),
        e("div", { className: "summary-card-value" }, String(summary.applicationsWithoutPlan || 0)),
        e("div", { className: "summary-card-sub" },
          summary.applicationsWithoutPlan > 0
            ? e("span", { className: "danger-text" }, "Resilience gap: missing master DR plan")
            : e("span", { className: "ok-text" }, "Full inventory has master DR plan coverage")
        )
      )
    ),

    // 2. SEARCH, FILTERS & CONTROLS TOOLBAR
    e("article", { className: "card list-card", style: { marginTop: 16 } },
      e("div", { className: "list-toolbar" },
        // Search
        e("div", { className: "list-search", style: { flex: 2 } },
          e(Icon, { name: "search" }),
          e("input", {
            id: "plan-search-input",
            placeholder: "Search applications, plans, hosting, sites, strategies...",
            value: search,
            onChange: (ev) => setSearch(ev.target.value),
          })
        ),
        // Filter by Criticality Tier
        e("select", {
          className: "list-filter",
          value: tierFilter,
          onChange: (ev) => setTierFilter(ev.target.value),
        },
          e("option", { value: "all" }, "Criticality: All Tiers"),
          e("option", { value: "1" }, "Tier 1 (Mission Critical)"),
          e("option", { value: "2" }, "Tier 2 (Business Critical)"),
          e("option", { value: "3" }, "Tier 3 (Supporting)")
        ),
        // Filter by Status
        e("select", {
          className: "list-filter",
          value: statusFilter,
          onChange: (ev) => setStatusFilter(ev.target.value),
        },
          e("option", { value: "all" }, "Plan Status: All"),
          e("option", { value: "approved" }, "Approved / Published"),
          e("option", { value: "in_review" }, "In Review"),
          e("option", { value: "draft" }, "Draft"),
          e("option", { value: "expired" }, "Expired"),
          e("option", { value: "under_remediation" }, "Fail / Under Remediation"),
          e("option", { value: "none" }, "Without DR Plan (Gaps)")
        ),
        // Filter by Environment
        e("select", {
          className: "list-filter",
          value: envFilter,
          onChange: (ev) => setEnvFilter(ev.target.value),
        },
          e("option", { value: "all" }, "Environment: All"),
          envList.map((env) => e("option", { key: env.id, value: env.id }, env.name))
        ),
        // Filter by Site
        e("select", {
          className: "list-filter",
          value: siteFilter,
          onChange: (ev) => setSiteFilter(ev.target.value),
        },
          e("option", { value: "all" }, "Site / DC: All"),
          siteList.map((site) => e("option", { key: site.id, value: site.id }, site.name))
        ),
        (tierFilter !== "all" || statusFilter !== "all" || envFilter !== "all" || siteFilter !== "all" || search) &&
          e("button", {
            type: "button",
            className: "secondary",
            onClick: () => {
              setTierFilter("all");
              setStatusFilter("all");
              setEnvFilter("all");
              setSiteFilter("all");
              setSearch("");
            },
          }, "Reset Filters")
      ),

      // 3. PLANS & APPLICATIONS TABLE
      e("table", { className: "clickable list-table itdr-plans-table" },
        e("thead", null, e("tr", null,
          e("th", { onClick: () => toggleSort("name") }, "Application Name ", e(Icon, { name: sortField === "name" ? (sortAsc ? "arrow_upward" : "arrow_downward") : "swap_vert" })),
          e("th", { onClick: () => toggleSort("tier") }, "Criticality Tier ", e(Icon, { name: sortField === "tier" ? (sortAsc ? "arrow_upward" : "arrow_downward") : "swap_vert" })),
          e("th", null, "High-Level Plan (Strategy)"),
          e("th", null, "Hosting (Production -> DR)"),
          e("th", null, "RTO / RPO"),
          e("th", { onClick: () => toggleSort("planStatus") }, "Plan Status ", e(Icon, { name: sortField === "planStatus" ? (sortAsc ? "arrow_upward" : "arrow_downward") : "swap_vert" })),
          e("th", { onClick: () => toggleSort("review") }, "Last / Next Review ", e(Icon, { name: sortField === "review" ? (sortAsc ? "arrow_upward" : "arrow_downward") : "swap_vert" })),
          e("th", { style: { textAlign: "right" } }, "Actions")
        )),
        e("tbody", null,
          rows.length
            ? rows.map((r) => {
                const ps = PLAN_STATUS[r.planStatus] || PLAN_STATUS.none;
                const compositePreview = (r.hosting || [])[0]?.compositeLabel || `${r.name} | Production | ${r.primarySite || "Default"}`;

                return e("tr", {
                  key: r.biaApplicationId,
                  onClick: () => { location.hash = `#target/${r.biaApplicationId}/runbook`; },
                },
                  // Application Name + ID + Composite Tag
                  e("td", null,
                    e("div", { className: "app-cell" },
                      e("strong", { className: "app-name-link" }, r.name),
                      e("div", { className: "app-cell-sub" },
                        e("span", { className: "mono chip-id" }, r.biaApplicationId),
                        r.hostingWarning && e("span", { className: "warn-indicator", title: r.hostingWarning }, e(Icon, { name: "warning" }))
                      )
                    )
                  ),
                  // Criticality Tier
                  e("td", null,
                    r.tier != null
                      ? e("span", { className: `tier-badge tier-${r.tier}` }, `Tier ${r.tier}`)
                      : e("span", { className: "unset" }, "—")
                  ),
                  // High-Level Plan (short summary / strategy with tooltip)
                  e("td", null,
                    e("div", { className: "plan-strategy-cell", title: r.highLevelPlan || "No recovery strategy configured" },
                      e("span", { className: "plan-strategy-text" }, r.highLevelPlan || "—"),
                      r.strategy && e("span", { className: "strategy-tag" }, r.strategy.replace(/_/g, " "))
                    )
                  ),
                  // Hosting (Production site -> DR site)
                  e("td", null,
                    e("div", { className: "hosting-topology-cell" },
                      e("span", { className: "hosting-summary-text" }, r.hostingSummary || "—"),
                      e("span", { className: "composite-mini", title: compositePreview }, compositePreview)
                    )
                  ),
                  // RTO / RPO
                  e("td", null,
                    e("div", { className: "rto-rpo-cell" },
                      e("span", { className: "mono" }, `RTO: ${r.rto || "—"}`),
                      e("span", { className: "mono" }, `RPO: ${r.rpo || "—"}`)
                    )
                  ),
                  // Plan Status
                  e("td", null, e(StatusPill, { kind: ps.kind }, ps.label)),
                  // Last Reviewed / Next Review
                  e("td", { className: "muted mono text-sm" },
                    e("div", null, `Last: ${formatDate(r.lastReviewedAt)}`),
                    e("div", { className: r.nextReviewDueAt && new Date(r.nextReviewDueAt).getTime() < Date.now() ? "danger-text" : "" },
                      `Next: ${formatDate(r.nextReviewDueAt)}`
                    )
                  ),
                  // Actions (View, Edit, Delete Draft)
                  e("td", { style: { textAlign: "right", whiteSpace: "nowrap" } },
                    e("div", { className: "row-actions", onClick: (ev) => ev.stopPropagation() },
                      e("button", {
                        type: "button",
                        className: "action-btn view-btn",
                        title: "View plan runbook",
                        onClick: () => { location.hash = `#target/${r.biaApplicationId}/runbook`; },
                      }, e(Icon, { name: "visibility" }), "View"),
                      canEdit && e("button", {
                        type: "button",
                        className: "action-btn edit-btn",
                        title: "Edit DR Plan",
                        onClick: () => openNewPlan(r.biaApplicationId),
                      }, e(Icon, { name: "edit" }), "Edit"),
                      canEdit && r.draftStatus === "draft" && e("button", {
                        type: "button",
                        className: "action-btn delete-btn",
                        title: "Delete Draft",
                        onClick: (ev) => handleDeleteDraft(r.biaApplicationId, ev),
                      }, e(Icon, { name: "delete" }))
                    )
                  )
                );
              })
            : e("tr", null, e("td", { colSpan: 8, className: "muted", style: { textAlign: "center", padding: "32px 16px" } },
                e("div", { className: "empty-state" },
                  e(Icon, { name: "search_off", style: { fontSize: 32, color: "var(--muted)" } }),
                  e("p", null, "No disaster recovery plans found matching current filter criteria."),
                  canEdit && e("button", {
                    type: "button",
                    className: "accent",
                    style: { marginTop: 10 },
                    onClick: () => openNewPlan(),
                  }, "+ Create New DR Plan")
                )
              ))
        )
      )
    ),

    // Wizard Modal
    showWizard && e(PlanWizard, {
      apps: data.rows || [],
      defaultAppId: selectedAppId,
      catalogs,
      users,
      session,
      onClose: () => {
        setShowWizard(false);
        setSelectedAppId(null);
      },
      onError,
      onCreated: (id) => {
        setShowWizard(false);
        setSelectedAppId(null);
        load();
        location.hash = `#target/${id}/runbook`;
      },
    })
  );
}
