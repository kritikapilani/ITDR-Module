import { e, useState, useEffect, api, Icon, StatusPill } from "./core.js";
import { PlanModal } from "./PlanModal.js";

const HOSTING = {
  aws: "Cloud AWS",
  azure: "Cloud Azure",
  gcp: "Cloud GCP",
  on_prem: "On-prem",
  hybrid: "Hybrid",
  vendor_hosted: "SaaS Vendor",
};

const PLAN_STATUS = {
  published: { label: "Published", kind: "published" },
  approved: { label: "Approved", kind: "approved" },
  in_review: { label: "In Review", kind: "review" },
  draft: { label: "Draft", kind: "draft" },
  expired: { label: "Expired", kind: "expired" },
  under_remediation: { label: "Fail", kind: "fail" },
  none: { label: "—", kind: "neutral" },
};

function hostingLabel(value) {
  return HOSTING[value] || (value ? String(value).replace(/_/g, " ") : "—");
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function planStatusOf(r) {
  if (r.planStatus && r.planStatus !== "none") return r.planStatus;
  const s = r.readiness?.status;
  const draft = r.draftStatus;
  if (s === "expired") return "expired";
  if (s === "failed_test") return "under_remediation";
  if (draft === "in_review") return "in_review";
  if (s === "ready") return "published";
  if (r.currentApprovedVersionId) return "approved";
  if (draft === "draft") return "draft";
  return "none";
}

function ownerCell(users, userId) {
  const user = (users || []).find((u) => u.userId === userId);
  if (!userId || !user) return e("span", { className: "unset" }, "unassigned");
  return user.displayName;
}

export function Coverage({ catalogs, users, session, onError, query, mode }) {
  const [data, setData] = useState(null);
  const [showPlan, setShowPlan] = useState(false);
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const isAdmin = session?.role === "ADMIN";
  const canEdit = ["ADMIN", "PLAN_OWNER"].includes(session?.role);
  const builder = mode === "builder";

  async function load() {
    const cov = await api("/api/itdr/coverage");
    setData(cov);
  }

  useEffect(() => {
    load().catch((err) => onError(err.message));
  }, []);

  if (!data) return e("p", { className: "muted" }, "Loading applications…");

  const q = `${search} ${query || ""}`.trim().toLowerCase();
  let rows = (data.rows || []).filter((r) => {
    if (tier && String(r.tier) !== String(tier)) return false;
    if (!q) return true;
    const hay = `${r.name} ${r.biaApplicationId} ${r.hostingEnvironment || ""}`.toLowerCase();
    return hay.includes(q);
  });
  rows = [...rows].sort((a, b) => {
    const av = a.lastTestedAt || a.evidence?.testCompletedAt || "";
    const bv = b.lastTestedAt || b.evidence?.testCompletedAt || "";
    return sortDesc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
  });

  return e(
    "div",
    { className: "list-page" },
    e("div", { className: "list-head" },
      e("div", null,
        e("nav", { className: "crumb" },
          e("a", { href: "#dashboard" }, "ITDR"),
          e("span", { className: "crumb-sep" }, ">"),
          e("span", null, builder ? "DR Plans" : "Applications")
        ),
        e("h1", null, builder ? "DR Plans" : "Applications")
      ),
      e("div", { className: "actions" },
        builder
          ? canEdit && e("button", { type: "button", className: "accent", onClick: () => setShowPlan(true) }, e(Icon, { name: "add" }), "Add DR Plan")
          : isAdmin && e("button", { type: "button", className: "accent", onClick: () => { location.hash = "#coverage/new"; } }, e(Icon, { name: "add" }), "Add application")
      )
    ),
    e("article", { className: "card list-card" },
      e("div", { className: "list-toolbar" },
        e("div", { className: "list-search" },
          e(Icon, { name: "search" }),
          e("input", {
            placeholder: "Search applications...",
            value: search,
            onChange: (ev) => setSearch(ev.target.value),
          })
        ),
        e("select", { className: "list-filter", value: tier, onChange: (ev) => setTier(ev.target.value) },
          e("option", { value: "" }, "All tiers"),
          e("option", { value: "1" }, "Tier 1"),
          e("option", { value: "2" }, "Tier 2"),
          e("option", { value: "3" }, "Tier 3")
        )
      ),
      e("table", { className: "clickable list-table" },
        e("thead", null, e("tr", null,
          e("th", null, "Application"),
          e("th", null, "Owner"),
          e("th", null, "Tier"),
          e("th", null, "Hosting"),
          e("th", null, "Plan status"),
          e("th", { className: "sortable", onClick: () => setSortDesc((s) => !s) }, "Last tested ", e(Icon, { name: "swap_vert" }))
        )),
        e("tbody", null,
          rows.length
            ? rows.map((r) => {
                const ps = PLAN_STATUS[planStatusOf(r)] || PLAN_STATUS.none;
                return e("tr", {
                  key: r.biaApplicationId,
                  onClick: () => { location.hash = builder ? `#target/${r.biaApplicationId}/runbook` : `#target/${r.biaApplicationId}`; },
                },
                  e("td", null, e("div", { className: "app-cell" }, e("strong", null, r.name), e("span", { className: "mono" }, r.biaApplicationId))),
                  e("td", null, ownerCell(users, r.applicationOwnerUserId || r.primaryOwnerUserId)),
                  e("td", null, r.tier != null ? e("span", { className: "tier-outline" }, `Tier ${r.tier}`) : e("span", { className: "unset" }, "—")),
                  e("td", null, hostingLabel(r.hostingEnvironment)),
                  e("td", null, e(StatusPill, { kind: ps.kind }, ps.label)),
                  e("td", { className: "muted mono" }, formatDate(r.lastTestedAt || r.evidence?.testCompletedAt))
                );
              })
            : e("tr", null, e("td", { colSpan: 6, className: "muted" }, "No applications in BIA scope."))
        )
      )
    ),
    showPlan && e(PlanModal, {
      apps: data.rows || [],
      catalogs,
      users,
      session,
      onClose: () => setShowPlan(false),
      onError,
      onCreated: (id) => { setShowPlan(false); load(); location.hash = `#target/${id}/runbook`; },
    })
  );
}