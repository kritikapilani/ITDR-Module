import { e, useState, api, Field, Select, UserSelect, ChipInput } from "./core.js";

const HOSTING = [
  { value: "on_prem", label: "On-prem" },
  { value: "aws", label: "Cloud AWS" },
  { value: "azure", label: "Cloud Azure" },
  { value: "gcp", label: "Cloud GCP" },
  { value: "hybrid", label: "Hybrid" },
  { value: "vendor_hosted", label: "SaaS Vendor" },
];

const TYPES = [
  { value: "custom_built", label: "Custom-built" },
  { value: "cots", label: "COTS" },
  { value: "saas", label: "SaaS" },
  { value: "legacy", label: "Legacy" },
];

const ASSET_TYPES = ["application", "infrastructure", "datastore", "network", "identity", "third_party"];
const ENVIRONMENTS = ["prod", "dr", "nonprod"];
const CRITICALITY = ["high", "medium", "low"];

function emptyAsset() {
  return {
    name: "",
    assetId: "",
    type: "infrastructure",
    environment: "prod",
    criticality: "medium",
    ownerUserId: "",
    recoveryNotes: "",
  };
}

function emptyApp() {
  return {
    name: "",
    biaApplicationId: "",
    applicationOwnerUserId: "",
    applicationType: "",
    hostingEnvironment: "",
    processName: "",
    tier: "2",
    infrastructure: [emptyAsset()],
    vendors: [],
    lifecycleStatus: "active",
  };
}

export function ApplicationForm({ users, session, onError }) {
  const [form, setForm] = useState(emptyApp);
  const [busy, setBusy] = useState(false);
  const isAdmin = session?.role === "ADMIN";

  function set(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function setAsset(i, name, value) {
    setForm((f) => {
      const infrastructure = [...f.infrastructure];
      infrastructure[i] = { ...infrastructure[i], [name]: value };
      return { ...f, infrastructure };
    });
  }

  async function submit(ev) {
    ev.preventDefault();
    if (!isAdmin) {
      onError("Only BCM Admin can add applications to inventory.");
      return;
    }
    setBusy(true);
    try {
      const id = form.biaApplicationId.trim() || `bia-app-${Date.now().toString(36)}`;
      const created = await api("/api/itdr/bia/applications", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          biaApplicationId: id,
          tier: Number(form.tier),
          processName: form.processName,
          applicationType: form.applicationType || null,
          hostingEnvironment: form.hostingEnvironment || null,
          lifecycleStatus: form.lifecycleStatus,
          vendorDependencies: (form.vendors || []).join(" | "),
          assets: (form.infrastructure || []).filter((a) => a.name || a.assetId),
          applicationOwnerUserId: form.applicationOwnerUserId || null,
          primaryOwnerUserId: form.applicationOwnerUserId || null,
        }),
      });
      location.hash = `#target/${created.biaApplicationId || id}`;
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return e(
    "div",
    { className: "list-page" },
    e("div", { className: "list-head" },
      e("div", null,
        e("nav", { className: "crumb" },
          e("a", { href: "#dashboard" }, "ITDR"),
          e("span", { className: "crumb-sep" }, ">"),
          e("a", { href: "#coverage" }, "Applications"),
          e("span", { className: "crumb-sep" }, ">"),
          e("span", null, "New")
        ),
        e("h1", null, "New application")
      )
    ),
    e("form", { className: "card form-panel", onSubmit: submit },
      e("div", { className: "form-grid two" },
        e(Field, { label: "Application Name", required: true },
          e("input", { required: true, value: form.name, onChange: (ev) => set("name", ev.target.value) })
        ),
        e(Field, { label: "Owner", required: true },
          e(UserSelect, { users, required: true, empty: "Select owner", value: form.applicationOwnerUserId, onChange: (ev) => set("applicationOwnerUserId", ev.target.value) })
        ),
        e(Field, { label: "Application Type", required: true },
          e(Select, { required: true, empty: "Select type", value: form.applicationType, onChange: (ev) => set("applicationType", ev.target.value), options: TYPES })
        ),
        e(Field, { label: "Hosting Environment", required: true },
          e(Select, { required: true, empty: "Select hosting", value: form.hostingEnvironment, onChange: (ev) => set("hostingEnvironment", ev.target.value), options: HOSTING })
        ),
        e(Field, { label: "Criticality Tier", required: true },
          e(Select, { required: true, value: form.tier, onChange: (ev) => set("tier", ev.target.value), options: [{ value: "1", label: "Tier 1" }, { value: "2", label: "Tier 2" }, { value: "3", label: "Tier 3" }] })
        ),
        e(Field, { label: "Linked Business Process", required: true, tag: "from BIA" },
          e("input", { required: true, value: form.processName, onChange: (ev) => set("processName", ev.target.value), placeholder: "e.g. Settlement" })
        ),
        e(Field, { label: "Impact Assessment ID", hint: "Leave blank to auto-generate" },
          e("input", { className: "mono", value: form.biaApplicationId, onChange: (ev) => set("biaApplicationId", ev.target.value), placeholder: "bia-app-…" })
        ),
        e(Field, { label: "Status", required: true },
          e(Select, {
            required: true,
            value: form.lifecycleStatus,
            onChange: (ev) => set("lifecycleStatus", ev.target.value),
            options: [
              { value: "active", label: "Active" },
              { value: "under_review", label: "Under Review" },
              { value: "decommissioned", label: "Decommissioned" },
            ],
          })
        )
      ),
      e("div", { className: "asset-section" },
        e("div", { className: "card-toolbar" },
          e("div", null,
            e("h2", { style: { margin: 0 } }, "Infrastructure Dependencies"),
            e("p", { className: "hint" }, "Entered per application (Phase 1) — not yet linked to a shared infrastructure registry")
          ),
          e("button", {
            type: "button",
            className: "secondary",
            onClick: () => set("infrastructure", [...form.infrastructure, emptyAsset()]),
          }, "+ Add asset")
        ),
        form.infrastructure.map((a, i) =>
          e("div", { className: "asset-block", key: i },
            e("div", { className: "card-toolbar" },
              e("h3", { style: { margin: 0 } }, `Asset ${i + 1}`),
              form.infrastructure.length > 1 && e("button", {
                type: "button",
                className: "secondary",
                onClick: () => set("infrastructure", form.infrastructure.filter((_, j) => j !== i)),
              }, "Remove")
            ),
            e("div", { className: "form-grid two" },
              e(Field, { label: "Asset name" },
                e("input", { value: a.name, onChange: (ev) => setAsset(i, "name", ev.target.value), placeholder: "e.g. Payments DB" })
              ),
              e(Field, { label: "Asset ID" },
                e("input", { className: "mono", value: a.assetId, onChange: (ev) => setAsset(i, "assetId", ev.target.value), placeholder: "optional stable id" })
              ),
              e(Field, { label: "Type", required: true },
                e(Select, { required: true, value: a.type, onChange: (ev) => setAsset(i, "type", ev.target.value), options: ASSET_TYPES })
              ),
              e(Field, { label: "Environment", required: true },
                e(Select, { required: true, value: a.environment, onChange: (ev) => setAsset(i, "environment", ev.target.value), options: ENVIRONMENTS })
              ),
              e(Field, { label: "Criticality", required: true },
                e(Select, { required: true, value: a.criticality, onChange: (ev) => setAsset(i, "criticality", ev.target.value), options: CRITICALITY })
              ),
              e(Field, { label: "Technical owner" },
                e(UserSelect, { users, empty: "(none)", value: a.ownerUserId, onChange: (ev) => setAsset(i, "ownerUserId", ev.target.value) })
              )
            ),
            e(Field, { label: "Recovery notes" },
              e("textarea", { value: a.recoveryNotes, onChange: (ev) => setAsset(i, "recoveryNotes", ev.target.value), placeholder: "Failover path, restore job, vendor contact…" })
            )
          )
        )
      ),
      e(Field, {
        label: "Vendor/Third-Party Dependencies",
        hint: "Entered per application (Phase 1)",
      }, e(ChipInput, { values: form.vendors, onChange: (v) => set("vendors", v), placeholder: "Type a vendor and press Enter" })),
      e("div", { className: "form-foot" },
        e("button", { type: "button", className: "secondary", onClick: () => { location.hash = "#coverage"; } }, "Cancel"),
        e("button", { type: "submit", className: "accent", disabled: busy }, busy ? "Saving…" : "Add application")
      )
    )
  );
}

export const ApplicationModal = ApplicationForm;
