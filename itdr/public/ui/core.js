export const e = (type, props, ...children) =>
  React.createElement(type, props, ...children.flat().filter((c) => c !== false && c != null && c !== undefined));

export const useState = (...a) => React.useState(...a);
export const useEffect = (...a) => React.useEffect(...a);
export const Fragment = (...children) => React.createElement(React.Fragment, null, ...children.flat());

export const ROLES = [
  { id: "ADMIN", label: "BCM Admin / DR Coordinator" },
  { id: "PLAN_OWNER", label: "Plan Owner" },
  { id: "APPROVER", label: "Reviewer / Approver" },
  { id: "AUDITOR", label: "Auditor" },
  { id: "EXECUTIVE", label: "Executive" },
  { id: "TEST_MANAGER", label: "Test Manager (Testing module — not ITDR)" },
  { id: "INCIDENT_COMMANDER", label: "Incident Commander (Crisis — not ITDR)" },
];

export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

export function pretty(value) {
  return String(value || "").replace(/_/g, " ");
}

export function minutesToHhmm(m) {
  if (m == null || m === "") return "";
  const n = Number(m);
  if (!Number.isFinite(n)) return "";
  const h = Math.floor(n / 60);
  const min = n % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function hhmmToMinutes(s) {
  if (s == null || s === "") return undefined;
  if (/^\d+$/.test(String(s).trim())) return Number(s);
  const parts = String(s).split(":");
  const h = Number(parts[0] || 0);
  const min = Number(parts[1] || 0);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return undefined;
  return h * 60 + min;
}

export function parseDuration(s) {
  if (s == null || s === "") return undefined;
  const t = String(s).trim().toLowerCase();
  if (/^\d+$/.test(t)) return Number(t);
  const colon = t.match(/^(\d+)\s*:\s*(\d+)$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  let minutes = 0;
  let matched = false;
  const h = t.match(/(\d+)\s*h/);
  const m = t.match(/(\d+)\s*m/);
  if (h) { minutes += Number(h[1]) * 60; matched = true; }
  if (m) { minutes += Number(m[1]); matched = true; }
  return matched ? minutes : hhmmToMinutes(s);
}

export function toIso(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDateInput(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

export function displayName(users, userId) {
  if (!userId) return "";
  const user = (users || []).find((u) => u.userId === userId);
  return user ? user.displayName : userId;
}

export function dash(value) {
  if (value == null || value === "") return "—";
  return value;
}

export function splitChips(value) {
  return String(value || "")
    .split(/\s*[|,;\n]\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function ChipInput({ values, onChange, placeholder }) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v || (values || []).includes(v)) { setDraft(""); return; }
    onChange([...(values || []), v]);
    setDraft("");
  }
  return e(
    "div",
    { className: "chip-input" },
    e("div", { className: "chip-row" },
      (values || []).map((v, i) =>
        e("span", { key: `${v}-${i}`, className: "tag-chip" },
          v,
          e("button", { type: "button", className: "chip-x", onClick: () => onChange(values.filter((_, j) => j !== i)), "aria-label": "Remove" }, "×")
        )
      )
    ),
    e("div", { className: "chip-add" },
      e("input", {
        value: draft,
        placeholder: placeholder || "Type and press Enter",
        onChange: (ev) => setDraft(ev.target.value),
        onKeyDown: (ev) => { if (ev.key === "Enter") { ev.preventDefault(); add(); } },
      }),
      e("button", { type: "button", className: "secondary", onClick: add }, "+ Add")
    )
  );
}

export function StatusPill({ kind, children, dot }) {
  if (!children || children === "—") return e("span", { className: "unset" }, "—");
  return e("span", { className: `status-pill kind-${kind || "neutral"}` },
    dot !== false ? e("span", { className: "dot" }) : null,
    children
  );
}

export function Field({ label, required, hint, tag, children }) {
  return e("label", { className: "field" },
    e("span", { className: "field-label" },
      e("span", { className: required ? "req" : "" }, label),
      tag ? e("span", { className: "source-tag" }, tag) : null
    ),
    children,
    hint ? e("span", { className: "hint" }, hint) : null
  );
}

export function Select({ value, onChange, options, empty, required, disabled }) {
  const items = options || [];
  return e(
    "select",
    { value: value ?? "", onChange, required, disabled },
    empty != null ? e("option", { value: "" }, empty) : null,
    items.map((item) => {
      const v = typeof item === "string" ? item : item.value;
      const label = typeof item === "string" ? pretty(item) : item.label;
      return e("option", { key: v, value: v }, label);
    })
  );
}

export function Icon({ name }) {
  return e("span", { className: "material-symbols-outlined", "aria-hidden": true }, name);
}

export function PageHeader({ kicker, title, subtitle, actions }) {
  return e(
    "div",
    { className: "page-head" },
    e("div", null, kicker && e("div", { className: "kicker" }, kicker), e("h1", null, title), subtitle && e("p", { className: "sub" }, subtitle)),
    actions && e("div", { className: "actions" }, actions)
  );
}

export function Tabs({ items, value, onChange }) {
  return e(
    "div",
    { className: "tab-bar pill-tabs" },
    (items || []).map((t) =>
      e("button", { key: t.id, type: "button", className: `tab${value === t.id ? " active" : ""}`, onClick: () => onChange(t.id) },
        t.label
      )
    )
  );
}

export function Crumb({ items }) {
  return e(
    "nav",
    { className: "crumb" },
    (items || []).flatMap((item, i) => {
      const node = item.href
        ? e("a", { key: item.label, href: item.href, className: item.mono ? "mono" : "" }, item.label)
        : e("span", { key: item.label, className: item.mono ? "mono" : "" }, item.label);
      return i ? [e("span", { key: `s${i}`, className: "crumb-sep" }, ">"), node] : [node];
    })
  );
}

export function Metric({ label, value, hint, tone, icon }) {
  return e(
    "article",
    { className: `metric${tone ? ` tone-${tone}` : ""}` },
    e("div", null, e("div", { className: "metric-label" }, label), e("div", { className: "kpi" }, value), hint && e("div", { className: "metric-hint muted" }, hint)),
    icon && e("div", { className: "metric-icon" }, e(Icon, { name: icon }))
  );
}

export function Pill({ status, children }) {
  return e("span", { className: `pill st-${status || ""}` }, children || pretty(status) || "unknown");
}

export function Banner({ message, kind }) {
  if (!message) return null;
  return e("div", { className: `banner${kind === "warn" ? " warn" : ""}` }, message);
}

export function UserSelect({ users, value, onChange, empty, required }) {
  return e(Select, {
    value,
    onChange,
    required,
    empty: empty || "(none)",
    options: (users || []).map((u) => ({ value: u.userId, label: `${u.displayName} (${pretty(u.role)})` })),
  });
}

export const GAP_LABELS = {
  bia_gap_missing_rto_rpo: "BIA missing RTO/RPO",
  review_window_elapsed: "Review window elapsed",
  claimed_worse_than_live_bia: "Claimed RTO/RPO worse than BIA",
  override_worse_than_live_bia: "IT override worse than BIA",
  bia_snapshot_drift: "BIA changed since last approval",
  failed_test_or_unmet_rto: "Failed test or unmet RTO/RPO",
  missing_actual_rto_rpo: "Missing actual RTO/RPO",
  incomplete_step_results: "Incomplete step results",
  untested_current_version: "Current approved version untested",
  retired: "Plan retired",
  out_of_bia_scope: "Out of BIA scope",
};

export function gapLabel(code) {
  if (!code) return "";
  const key = String(code);
  if (GAP_LABELS[key]) return GAP_LABELS[key];
  if (key.startsWith("ignored_unbound:")) return `Unbound test ignored (${key.slice(16)})`;
  return pretty(key);
}

export function Modal({ title, subtitle, onClose, children, footer, className }) {
  return e(
    "div",
    { className: "modal-backdrop", onClick: (ev) => { if (ev.target === ev.currentTarget) onClose(); } },
    e("div", { className: `modal${className ? ` ${className}` : ""}`, role: "dialog", "aria-modal": "true" },
      e("div", { className: "modal-head" },
        e("div", null, e("h2", null, title), subtitle && e("p", { className: "muted" }, subtitle)),
        e("button", { type: "button", className: "icon-btn", onClick: onClose, title: "Close", "aria-label": "Close" }, "×")
      ),
      e("div", { className: "modal-body" }, children),
      footer ? e("div", { className: "modal-foot" }, footer) : null
    )
  );
}
