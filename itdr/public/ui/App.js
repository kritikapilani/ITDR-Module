import { e, useState, useEffect, api, ROLES, Banner, Icon } from "./core.js";
import { Coverage } from "./Coverage.js";
import { Target } from "./Target.js";
import { Testing } from "./Testing.js";
import { ApplicationForm } from "./ApplicationModal.js";
import { Dashboard, Approvals, OtherModule, Process, Overview, JsonPage } from "./Dashboard.js";

const TITLES = {
  bia: ["Business Impact Analysis", "Existing BCM module — not owned by ITDR"],
  bcp: ["Business Continuity Planning", "Existing BCM module — not owned by ITDR"],
  crisis: ["Crisis Management", "Invocation deferred; DR data is linkage-compatible"],
  testing: ["Test Records & Results", "DR Test type, schedule, and bound results"],
  calendar: ["DR Testing Calendar", "Failover cadence and execution schedule"],
  coverage: ["IT Applications & Asset Inventory", "Manage disaster recovery scope, tier classifications, hosting, and linked processes"],
  builder: ["DR Plan Builder", "Open an application to edit its recovery runbook"],
  itdr: ["IT Applications & Asset Inventory", "Manage disaster recovery scope, tier classifications, hosting, and linked processes"],
  dashboard: ["ITDR Readiness Dashboard", "Application resilience, compliance posture, and DR plan health"],
  process: ["Process mapping", "A process has no DR plan; applications mapped to it do"],
  approvals: ["Plan Approvals", "Segregation of duties: author cannot approve"],
  overview: ["Resilience operations", "Phase 2 — derived ready, Testing owns the calendar"],
  decisions: ["Settings", "Sprint 0 decisions still in force"],
  audit: ["Compliance & Audit Reports", "Approvals, overrides, and assignment trail"],
  target: ["Application detail", "Runbook, RTO/RPO, and recovery strategy"],
};

function parseHash() {
  const raw = (location.hash || "#dashboard").slice(1);
  const [page, id, extra] = raw.split("/");
  return { page: page || "dashboard", id, extra };
}

function initials(name) {
  const parts = String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase() || "—";
}

const SCOPE_LABEL = "Global Enterprise IT · ITDR";

export function App() {
  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [catalogs, setCatalogs] = useState({ strategies: [] });
  const [flag, setFlag] = useState(true);
  const [menu, setMenu] = useState(null);
  const [route, setRoute] = useState(parseHash());
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onHash = () => {
      setError("");
      setWarn("");
      setRoute(parseHash());
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    function onDoc(ev) {
      if (!ev.target.closest("[data-top-menu]")) setMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  useEffect(() => {
    (async () => {
      let sess = await api("/api/session");
      if (!sess.role) sess = await api("/api/session", { method: "PUT", body: JSON.stringify({ role: "ADMIN", tenantId: "tenant-demo" }) });
      setSession(sess);
      const hasAccess = (sess.permissions || []).includes("itdr.access");
      if (hasAccess) {
        try {
          const dir = await api("/api/itdr/directory");
          setUsers(dir.users || []);
        } catch {
          /* ignore */
        }
        try {
          setCatalogs(await api("/api/itdr/catalogs"));
        } catch {
          /* ignore */
        }
      }
    })().catch((err) => setError(err.message));
  }, []);

  async function changeRole(role) {
    const sess = await api("/api/session", { method: "PUT", body: JSON.stringify({ role, tenantId: "tenant-demo" }) });
    setSession(sess);
    setError("");
    if ((sess.permissions || []).includes("itdr.access")) {
      const dir = await api("/api/itdr/directory");
      setUsers(dir.users || []);
      setCatalogs(await api("/api/itdr/catalogs"));
    }
  }

  if (!session) return e("p", { className: "muted" }, "Signing in…");

  const hasAccess = (session.permissions || []).includes("itdr.access");
  const itdrNav = flag && hasAccess;
  const { page, id, extra } = route;
  const [title, sub] = TITLES[page] || TITLES.dashboard;
  void title;
  void sub;

  function navItem(href, label, icon) {
    const hash = href.slice(1);
    const planExtras = ["runbook", "posture", "strategy", "team", "tests"];
    const active =
      hash === page ||
      (page === "itdr" && hash === "coverage") ||
      (page === "coverage" && hash === "coverage") ||
      (page === "target" && planExtras.includes(extra) && hash === "builder") ||
      (page === "target" && !planExtras.includes(extra) && hash === "coverage") ||
      (page === "builder" && hash === "builder") ||
      (page === "process" && hash === "coverage");
    return e("a", { className: `nav-item${active ? " active" : ""}`, href }, e(Icon, { name: icon }), e("span", null, label));
  }

  let view = null;
  try {
    if (page === "bia") view = e(OtherModule, { name: "Business Impact Analysis", owner: "BIA is authoritative for RTO/RPO and process mapping." });
    else if (page === "bcp") view = e(OtherModule, { name: "Business Continuity Planning", owner: "BCP owns business-side plans." });
    else if (page === "crisis") view = e(OtherModule, { name: "Crisis Management", owner: "No invoke control in ITDR (D6/D7)." });
    else if (page === "testing") view = e(Testing, { session, onError: setError, view: "records", focusTestId: id });
    else if (page === "calendar") view = e(Testing, { session, onError: setError, view: "calendar" });
    else if (page === "overview") view = e(Overview, { onError: setError });
    else if (page === "decisions") view = e(JsonPage, { path: "/api/itdr/decisions", onError: setError });
    else if (page === "audit") view = e(JsonPage, { path: "/api/itdr/audit", onError: setError });
    else if (page === "dashboard") view = e(Dashboard, { filter: id, onError: setError, query });
    else if (page === "process" && id) view = e(Process, { id, onError: setError });
    else if (page === "approvals") view = e(Approvals, { onError: setError });
    else if (page === "coverage" && id === "new") view = e(ApplicationForm, { catalogs, users, session, onError: setError });
    else if (page === "target" && id) view = e(Target, { id, tab: extra, catalogs, users, session, onError: setError, onWarn: setWarn });
    else if (page === "builder") view = e(Coverage, { catalogs, users, session, onError: setError, onWarn: setWarn, query, mode: "builder" });
    else view = e(Coverage, { catalogs, users, session, onError: setError, onWarn: setWarn, query });
  } catch (err) {
    view = e("div", { className: "card empty" }, err.message);
  }

  const roleLabel = ROLES.find((r) => r.id === session.role)?.label || session.role;
  const display = session.displayName || roleLabel;

  return e(
    "div",
    { id: "app" },
    e("header", { className: "top" },
      e("div", { className: "top-brand" },
        e("div", { className: "brand-mark" }, "IT"),
        e("div", { className: "brand-copy" },
          e("span", { className: "brand-name" }, "ITDR"),
          e("span", { className: "brand-sub" }, "Disaster Recovery")
        )
      ),
      e("div", { className: "top-center" },
        e("div", { className: "search-wrap" },
          e(Icon, { name: "search" }),
          e("input", {
            className: "search",
            placeholder: "Search applications, plans, tests...",
            value: query,
            onChange: (ev) => setQuery(ev.target.value),
          })
        ),
        e("span", { className: "top-split", "aria-hidden": true }),
        e("div", { className: "top-menu-host", "data-top-menu": "scope" },
          e("button", {
            type: "button",
            className: `scope-btn${menu === "scope" ? " open" : ""}`,
            onClick: () => setMenu((m) => (m === "scope" ? null : "scope")),
          },
            e(Icon, { name: "corporate_fare" }),
            e("span", { className: "scope-btn-label" }, SCOPE_LABEL),
            e(Icon, { name: "expand_more" })
          ),
          menu === "scope" && e("div", { className: "account-menu scope-menu" },
            e("p", { className: "menu-label" }, "Scope"),
            e("button", { type: "button", className: "menu-item active" },
              e(Icon, { name: "check" }),
              e("span", null, SCOPE_LABEL)
            )
          )
        )
      ),
      e("div", { className: "top-end" },
        e("button", { type: "button", className: "icon-btn bell-btn has-unread", title: "Notifications" },
          e(Icon, { name: "notifications" }),
          e("span", { className: "unread-dot", "aria-hidden": true })
        ),
        e("div", { className: "top-menu-host", "data-top-menu": "account" },
          e("button", {
            type: "button",
            className: `profile-btn${menu === "account" ? " open" : ""}`,
            onClick: () => setMenu((m) => (m === "account" ? null : "account")),
          },
            e("div", { className: "avatar" }, initials(display)),
            e("div", { className: "profile-copy" },
              e("strong", null, display),
              e("span", null, roleLabel)
            ),
            e(Icon, { name: "expand_more" })
          ),
          menu === "account" && e("div", { className: "account-menu" },
            e("p", { className: "menu-label" }, "Switch persona"),
            ROLES.map((r) =>
              e("button", {
                key: r.id,
                type: "button",
                className: `menu-item${session.role === r.id ? " active" : ""}`,
                onClick: () => {
                  changeRole(r.id).catch((err) => setError(err.message));
                  setMenu(null);
                },
              }, e("span", null, r.label))
            ),
            session.role === "ADMIN" && e("div", { className: "menu-sep" }),
            session.role === "ADMIN" && e("label", { className: "menu-item flag-item" },
              e("input", {
                type: "checkbox",
                checked: flag,
                onChange: async (ev) => {
                  const next = ev.target.checked;
                  try {
                    await api("/api/itdr/flags", { method: "PUT", body: JSON.stringify({ itdrEnabled: next }) });
                    setFlag(next);
                  } catch (err) {
                    setError(err.message);
                  }
                },
              }),
              e("span", null, "ITDR module enabled")
            )
          )
        )
      )
    ),
    e("aside", { className: "nav" },
      e("div", { className: "nav-scroll" },
        e("p", { className: "nav-label" }, "BCM platform"),
        navItem("#bia", "Business Impact Analysis", "analytics"),
        navItem("#bcp", "Business Continuity Planning", "account_tree"),
        navItem("#crisis", "Crisis Management", "e911_emergency"),
        itdrNav && e("p", { className: "nav-label" }, "Core"),
        itdrNav && navItem("#dashboard", "Readiness Dashboard", "speed"),
        itdrNav && navItem("#coverage", "Applications", "dns"),
        itdrNav && e("p", { className: "nav-label" }, "Recovery operations"),
        itdrNav && navItem("#builder", "DR Plan Builder", "schema"),
        itdrNav && navItem("#approvals", "Plan Approvals", "verified_user"),
        e("p", { className: "nav-label" }, "Testing & validation"),
        navItem("#testing", "Test Records & Results", "fact_check"),
        navItem("#calendar", "Test Calendar & Schedule", "event_note"),
        itdrNav && e("p", { className: "nav-label" }, "Governance"),
        itdrNav && navItem("#audit", "Compliance & Audit Reports", "policy"),
        itdrNav && navItem("#decisions", "Settings", "settings")
      ),
      e("div", { className: "nav-foot" },
        e("div", { className: "telemetry" }, e("span", null, e("span", { className: "dot" }), "Telemetry: Active"), e("span", null, "v4.8.2"))
      )
    ),
    e("div", { className: "main" },
      e("section", { className: "view" },
        e(Banner, { message: error || warn, kind: warn && !error ? "warn" : "error" }),
        view
      )
    )
  );
}
