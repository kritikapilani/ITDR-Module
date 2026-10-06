import { e, useState, useEffect, api, Field, Select, UserSelect, Modal, Icon, ChipInput, minutesToHhmm, hhmmToMinutes, pretty } from "./core.js";

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

function emptyHosting(envId = "env-prod", siteId = "site-mum-dc01", role = "primary") {
  return {
    hostingId: `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    environmentId: envId,
    siteId: siteId,
    role: role,
  };
}

function emptyStep(order) {
  return {
    stepId: "",
    order,
    title: "",
    instruction: "",
    ownerRole: "",
    prerequisite: "",
    estimatedDurationMinutes: "",
    rollback: "",
    verification: "",
  };
}

function emptyContact() {
  return {
    role: "",
    name: "",
    email: "",
    phone: "",
    contactType: "primary",
    escalationOrder: "",
  };
}

export function PlanWizard({ apps = [], defaultAppId, catalogs = {}, users = [], session, onClose, onError, onCreated }) {
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [appSearch, setAppSearch] = useState("");

  const appLibrary = catalogs.applicationLibrary || [];
  const siteLibrary = catalogs.siteLibrary || [];
  const envLibrary = catalogs.environmentLibrary || [];
  const scenariosLibrary = catalogs.scenarios || [];
  const isAdmin = session?.role === "ADMIN";

  // Form initial state
  const [form, setForm] = useState(() => {
    const defaultLibApp = appLibrary.find((a) => a.id === defaultAppId) || appLibrary[0] || {
      id: "app-custom",
      name: "Custom Application",
      type: "custom_built",
      defaultTier: 2,
      defaultOwnerUserId: "user-plan_owner",
    };

    const existingTarget = apps.find((r) => r.biaApplicationId === defaultLibApp.id);

    return {
      // Step 1: Application Details
      libraryAppId: defaultLibApp.id,
      name: existingTarget?.name || defaultLibApp.name,
      biaApplicationId: existingTarget?.biaApplicationId || defaultLibApp.id,
      applicationOwnerUserId: existingTarget?.applicationOwnerUserId || defaultLibApp.defaultOwnerUserId || "user-plan_owner",
      applicationType: defaultLibApp.type || existingTarget?.applicationType || "custom_built",
      tier: String(defaultLibApp.defaultTier || existingTarget?.tier || "2"),
      processName: existingTarget?.processes?.[0]?.name || "Core Transaction Processing",
      impactAssessmentId: existingTarget?.biaApplicationId || defaultLibApp.id,
      lifecycleStatus: existingTarget?.lifecycleStatus || "active",
      hosting: existingTarget?.hosting?.length
        ? existingTarget.hosting.map((h) => ({ ...h }))
        : [
            emptyHosting("env-prod", "site-mum-dc01", "primary"),
            emptyHosting("env-dr", "site-chn-dc02", "secondary"),
          ],
      infrastructure: existingTarget?.assets?.length
        ? existingTarget.assets.map((a) => ({ ...a }))
        : [emptyAsset()],
      vendors: existingTarget?.vendorDependencies ? existingTarget.vendorDependencies.split(" | ") : [],

      // Step 2: DR Plan Details
      planId: existingTarget?.planId || `dr-${defaultLibApp.id}`,
      title: `${existingTarget?.name || defaultLibApp.name} Technical Recovery Plan`,
      templateId: "",
      primaryOwnerUserId: existingTarget?.primaryOwnerUserId || defaultLibApp.defaultOwnerUserId || "user-plan_owner",
      backupOwnerUserId: existingTarget?.backupOwnerUserId || "user-admin",
      claimedRto: existingTarget?.rto || "02:00",
      claimedRpo: existingTarget?.rpo || "00:05",
      primaryHostingId: "",
      recoveryHostingId: "",
      strategy: existingTarget?.strategy || "hot_site",
      failoverMethod: existingTarget?.failoverMethod || "automated",
      backupFrequency: existingTarget?.backupFrequency || "hourly",
      backupRetentionValue: existingTarget?.backupRetentionValue ?? "30",
      backupRetentionUnit: existingTarget?.backupRetentionUnit || "days",
      activeScenario: "site_outage",
      steps: [
        {
          order: 1,
          title: "Declare Incident & Recovery Bridge",
          instruction: "Declare IT recovery in incident management and verify roster.",
          ownerRole: "Incident Commander",
          estimatedDurationMinutes: 15,
          prerequisite: "Crisis bridge open",
          rollback: "N/A",
          verification: "Attendance confirmed on bridge",
        },
        {
          order: 2,
          title: "DNS / Traffic Redirection to DR Site",
          instruction: "Initiate Route53 / Global Traffic Manager DNS switchover.",
          ownerRole: "Network Lead",
          estimatedDurationMinutes: 20,
          prerequisite: "DR health check verified",
          rollback: "Revert DNS CNAME records to primary",
          verification: "Public traffic flowing to DR IP range",
        },
        {
          order: 3,
          title: "Database Replication Promotion",
          instruction: "Promote standby database instance to primary read-write mode.",
          ownerRole: "DB Admin",
          estimatedDurationMinutes: 30,
          prerequisite: "Replication lag under target RPO",
          rollback: "Restore standby role",
          verification: "Database accepting read-write queries",
        },
      ],
      contacts: [
        { role: "Recovery Lead", name: "Alex Owner", email: "alex.owner@enterprise.com", phone: "+91 98765 43210", contactType: "primary", escalationOrder: 1 },
        { role: "Technical DR Custodian", name: "Jordan Admin", email: "jordan.admin@enterprise.com", phone: "+91 98765 43211", contactType: "backup", escalationOrder: 2 },
      ],
      fileName: "",
      attachKind: "diagram",
      attachNote: "",
    };
  });

  useEffect(() => {
    api("/api/itdr/templates")
      .then((d) => setTemplates(d.templates || []))
      .catch(() => setTemplates([]));
  }, []);

  function set(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  // Pick master app from Library
  function onSelectLibraryApp(appId) {
    const libApp = appLibrary.find((a) => a.id === appId);
    if (!libApp) return;

    const existingTarget = apps.find((r) => r.biaApplicationId === libApp.id);
    const appName = libApp.name;

    setForm((f) => {
      const updatedHosting = f.hosting.map((h) => ({
        ...h,
        compositeLabel: `${appName} | ${findEnvName(h.environmentId)} | ${findSiteName(h.siteId)}`,
      }));

      return {
        ...f,
        libraryAppId: libApp.id,
        name: appName,
        biaApplicationId: libApp.id,
        applicationType: libApp.type || f.applicationType,
        tier: String(libApp.defaultTier || f.tier),
        applicationOwnerUserId: libApp.defaultOwnerUserId || f.applicationOwnerUserId,
        primaryOwnerUserId: libApp.defaultOwnerUserId || f.primaryOwnerUserId,
        impactAssessmentId: libApp.id,
        planId: existingTarget?.planId || `dr-${libApp.id}`,
        title: `${appName} Technical Recovery Plan`,
        hosting: updatedHosting,
      };
    });
  }

  function findEnvName(id) {
    const e = envLibrary.find((x) => x.id === id);
    return e ? e.name : id === "env-prod" ? "Production" : id === "env-dr" ? "DR" : id;
  }

  function findSiteName(id) {
    const s = siteLibrary.find((x) => x.id === id);
    return s ? s.name : id;
  }

  // Hosting repeater handlers
  function addHostingRow() {
    // Pick an unused env or site if possible
    const usedKeys = new Set(form.hosting.map((h) => `${h.environmentId}::${h.siteId}`));
    let nextEnv = "env-dr";
    let nextSite = "site-chn-dc02";

    for (const env of envLibrary) {
      for (const site of siteLibrary) {
        if (!usedKeys.has(`${env.id}::${site.id}`)) {
          nextEnv = env.id;
          nextSite = site.id;
          break;
        }
      }
    }

    const nextRole = form.hosting.length === 0 ? "primary" : form.hosting.length === 1 ? "secondary" : "none";
    const row = emptyHosting(nextEnv, nextSite, nextRole);
    setForm((f) => ({ ...f, hosting: [...f.hosting, row] }));
  }

  function updateHostingRow(index, field, value) {
    setForm((f) => {
      const nextHosting = [...f.hosting];
      nextHosting[index] = { ...nextHosting[index], [field]: value };
      return { ...f, hosting: nextHosting };
    });
  }

  function removeHostingRow(index) {
    if (form.hosting.length <= 1) return;
    setForm((f) => ({
      ...f,
      hosting: f.hosting.filter((_, i) => i !== index),
    }));
  }

  // Hosting validations
  const hostingPairSet = new Set();
  let hasDuplicateHosting = false;
  let hasProductionHosting = false;
  const prodSiteIds = new Set();
  const drSiteIds = new Set();

  for (const h of form.hosting) {
    const key = `${h.environmentId}::${h.siteId}`;
    if (hostingPairSet.has(key)) hasDuplicateHosting = true;
    hostingPairSet.add(key);

    const isProd = h.environmentId === "env-prod" || h.role === "primary";
    const isDr = h.environmentId === "env-dr" || h.role === "secondary";
    if (isProd) {
      hasProductionHosting = true;
      prodSiteIds.add(h.siteId);
    }
    if (isDr) {
      drSiteIds.add(h.siteId);
    }
  }

  let sameSiteWarning = null;
  for (const pSite of prodSiteIds) {
    if (drSiteIds.has(pSite)) {
      const sName = findSiteName(pSite);
      sameSiteWarning = `Warning: Production and DR are configured at the same site (${sName}). Geographic redundancy is not satisfied.`;
      break;
    }
  }

  // Infrastructure repeater handlers
  function updateAsset(index, field, value) {
    setForm((f) => {
      const infrastructure = [...f.infrastructure];
      infrastructure[index] = { ...infrastructure[index], [field]: value };
      return { ...f, infrastructure };
    });
  }

  // Step 2 Template Picker
  function pickTemplate(id) {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) {
      set("templateId", "");
      return;
    }
    setForm((f) => ({
      ...f,
      templateId: id,
      strategy: tpl.strategy || f.strategy,
      steps: (tpl.steps || []).map((s, i) => ({
        stepId: "",
        order: s.order ?? i + 1,
        title: s.title || "",
        instruction: s.instruction || "",
        ownerRole: s.ownerRole || "",
        prerequisite: s.prerequisite || "",
        estimatedDurationMinutes: s.estimatedDurationMinutes ?? "",
        rollback: s.rollback || "",
        verification: s.verification || "",
      })),
      contacts: tpl.contacts?.length
        ? tpl.contacts.map((c) => ({
            role: c.role || "",
            name: c.name || "",
            email: c.email || "",
            phone: c.phone || "",
            contactType: c.contactType || "primary",
            escalationOrder: c.escalationOrder ?? "",
          }))
        : f.contacts,
    }));
  }

  // Validate step 1 before next
  function handleNext(ev) {
    if (ev) ev.preventDefault();
    if (hasDuplicateHosting) {
      onError("Cannot proceed: Duplicate Environment + Site pair detected in hosting topology.");
      return;
    }
    if (!hasProductionHosting) {
      onError("Cannot proceed: At least one Production hosting row is required.");
      return;
    }
    setStep(2);
  }

  // Save / Submit
  async function handleSave(submitForApproval = false) {
    if (hasDuplicateHosting) {
      onError("Duplicate Environment + Site pair detected in hosting configuration.");
      return;
    }
    if (!hasProductionHosting) {
      onError("At least one Production hosting row is required.");
      return;
    }

    setBusy(true);
    try {
      const appId = form.biaApplicationId.trim() || form.libraryAppId;
      const targetExists = apps.some((r) => r.biaApplicationId === appId);

      // 1. Create or update target application
      if (!targetExists) {
        if (isAdmin) {
          await api("/api/itdr/bia/applications", {
            method: "POST",
            body: JSON.stringify({
              name: form.name,
              biaApplicationId: appId,
              tier: Number(form.tier),
              processName: form.processName,
              applicationType: form.applicationType,
              hostingEnvironment: form.hosting[0]?.environmentId || "aws",
              lifecycleStatus: form.lifecycleStatus,
              vendorDependencies: (form.vendors || []).join(" | "),
              hosting: form.hosting,
              assets: form.infrastructure.filter((a) => a.name || a.assetId),
              applicationOwnerUserId: form.applicationOwnerUserId,
              primaryOwnerUserId: form.primaryOwnerUserId,
              backupOwnerUserId: form.backupOwnerUserId,
            }),
          });
        }
      } else {
        await api(`/api/itdr/targets/${appId}`, {
          method: "PATCH",
          body: JSON.stringify({
            applicationType: form.applicationType,
            lifecycleStatus: form.lifecycleStatus,
            vendorDependencies: (form.vendors || []).join(" | "),
            hosting: form.hosting,
            strategy: form.strategy,
            backupFrequency: form.backupFrequency,
            backupRetentionValue: form.backupRetentionValue,
            backupRetentionUnit: form.backupRetentionUnit,
            failoverMethod: form.failoverMethod,
            primaryOwnerUserId: form.primaryOwnerUserId,
            backupOwnerUserId: form.backupOwnerUserId,
          }),
        });
      }

      // 2. Create or update DR Plan draft
      let planRes;
      try {
        planRes = await api(`/api/itdr/targets/${appId}/plan`, {
          method: "POST",
          body: JSON.stringify({
            title: form.title,
            templateId: form.templateId || undefined,
            strategy: form.strategy,
            claimedRtoMinutes: hhmmToMinutes(form.claimedRto),
            claimedRpoMinutes: hhmmToMinutes(form.claimedRpo),
            primaryHostingId: form.primaryHostingId,
            recoveryHostingId: form.recoveryHostingId,
            failoverPairLabel: form.primaryHostingId && form.recoveryHostingId
              ? `${findSiteName(form.primaryHostingId)} (Prod) -> ${findSiteName(form.recoveryHostingId)} (DR)`
              : undefined,
            steps: form.steps,
            contacts: form.contacts,
            attachmentsAdd: form.fileName ? [{ fileName: form.fileName, kind: form.attachKind, note: form.attachNote }] : undefined,
          }),
        });
      } catch (err) {
        if (err.status === 409) {
          // A draft already exists or master plan exists: fetch target and update draft
          planRes = await api(`/api/itdr/targets/${appId}`);
        } else {
          throw err;
        }
      }

      const versionId = planRes?.draft?.versionId;
      if (versionId) {
        await api(`/api/itdr/versions/${versionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            etag: planRes.draft.etag,
            title: form.title,
            templateId: form.templateId || undefined,
            strategy: form.strategy,
            claimedRtoMinutes: hhmmToMinutes(form.claimedRto),
            claimedRpoMinutes: hhmmToMinutes(form.claimedRpo),
            steps: form.steps,
            contacts: form.contacts,
          }),
        });

        if (submitForApproval) {
          await api(`/api/itdr/versions/${versionId}/submit`, {
            method: "POST",
            body: JSON.stringify({}),
          });
        }
      }

      if (onCreated) {
        onCreated(appId);
      } else {
        onClose();
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Filtered applications from library
  const filteredApps = appLibrary.filter((a) => {
    if (!appSearch) return true;
    return a.name.toLowerCase().includes(appSearch.toLowerCase()) || a.id.toLowerCase().includes(appSearch.toLowerCase());
  });

  return e(
    Modal,
    {
      title: "New Disaster Recovery Plan",
      subtitle: "Unified ITDR Workflow: Configure Application Details, Hosting Topology, and Technical Recovery Runbook in one master plan.",
      onClose,
      footer: [
        e("button", { key: "c", type: "button", className: "secondary", onClick: onClose }, "Cancel"),
        step === 1 && e("button", { key: "draft1", type: "button", className: "secondary", disabled: busy, onClick: () => handleSave(false) }, e(Icon, { name: "save" }), "Save as draft"),
        step === 1 && e("button", { key: "next", type: "button", className: "accent", disabled: hasDuplicateHosting, onClick: handleNext }, "Next: DR Plan ->"),
        step === 2 && e("button", { key: "back", type: "button", className: "secondary", onClick: () => setStep(1) }, "<- Back"),
        step === 2 && e("button", { key: "draft2", type: "button", className: "secondary", disabled: busy, onClick: () => handleSave(false) }, e(Icon, { name: "save" }), "Save as draft"),
        step === 2 && e("button", { key: "submit", type: "button", className: "accent", disabled: busy, onClick: () => handleSave(true) }, e(Icon, { name: "verified" }), busy ? "Saving…" : "Save & Submit for Review"),
      ],
    },
    // Top Stepper Navigation
    e("div", { className: "wizard-stepper" },
      e("div", { className: `step-item${step === 1 ? " active" : step > 1 ? " completed" : ""}`, onClick: () => setStep(1) },
        e("span", { className: "step-number" }, "1"),
        e("div", { className: "step-text" },
          e("strong", null, "Application Details"),
          e("span", null, "Master Library & Hosting Topology")
        )
      ),
      e("div", { className: "step-connector" }),
      e("div", { className: `step-item${step === 2 ? " active" : ""}`, onClick: () => handleNext() },
        e("span", { className: "step-number" }, "2"),
        e("div", { className: "step-text" },
          e("strong", null, "DR Plan & Runbook"),
          e("span", null, "RTO/RPO, Strategy & Scenarios")
        )
      )
    ),

    // ==========================================
    // STEP 1: Application Details
    // ==========================================
    step === 1 && e("div", { className: "stack", style: { marginTop: 16 } },
      e("div", { className: "card-toolbar", style: { borderBottom: "1px solid var(--line-soft)", paddingBottom: 10 } },
        e("h3", { style: { margin: 0 } }, "1.1 Application Master Details"),
        e("span", { className: "chip" }, "From Application Library")
      ),
      e("div", { className: "form-grid two" },
        // Application Name: Searchable Dropdown populated from Application Library
        e(Field, { label: "Application Name", required: true, hint: "Populated from Master Application Library" },
          e(Select, {
            required: true,
            value: form.libraryAppId,
            onChange: (ev) => onSelectLibraryApp(ev.target.value),
            options: filteredApps.map((a) => ({
              value: a.id,
              label: `${a.name} (${a.type ? pretty(a.type) : "App"} · Tier ${a.defaultTier || "—"})`,
            })),
          })
        ),
        e(Field, { label: "Owner", required: true },
          e(UserSelect, {
            users,
            required: true,
            empty: "Select owner",
            value: form.applicationOwnerUserId,
            onChange: (ev) => set("applicationOwnerUserId", ev.target.value),
          })
        ),
        e(Field, { label: "Application Type", required: true, hint: "From Library" },
          e(Select, {
            required: true,
            disabled: true,
            value: form.applicationType,
            onChange: (ev) => set("applicationType", ev.target.value),
            options: catalogs.applicationTypes?.map((t) => ({ value: t, label: pretty(t) })) || [
              { value: "custom_built", label: "Custom Built" },
              { value: "cots", label: "COTS" },
              { value: "saas", label: "SaaS" },
              { value: "legacy", label: "Legacy" },
            ],
          })
        ),
        e(Field, { label: "Criticality Tier", required: true, hint: "From Library" },
          e(Select, {
            required: true,
            disabled: true,
            value: form.tier,
            onChange: (ev) => set("tier", ev.target.value),
            options: [
              { value: "1", label: "Tier 1 (Mission Critical)" },
              { value: "2", label: "Tier 2 (Business Critical)" },
              { value: "3", label: "Tier 3 (Supporting / Non-Critical)" },
            ],
          })
        ),
        e(Field, { label: "Linked Business Process", required: true, tag: "FROM BIA" },
          e("input", {
            required: true,
            value: form.processName,
            onChange: (ev) => set("processName", ev.target.value),
            placeholder: "e.g. Settlement Processing",
          })
        ),
        e(Field, { label: "Impact Assessment ID", hint: "Leave blank to auto-generate" },
          e("input", {
            className: "mono",
            value: form.impactAssessmentId,
            onChange: (ev) => set("impactAssessmentId", ev.target.value),
            placeholder: "bia-app-…",
          })
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

      // Repeatable Hosting Section
      e("div", { className: "hosting-section-card", style: { marginTop: 20 } },
        e("div", { className: "card-toolbar" },
          e("div", null,
            e("h3", { style: { margin: 0 } }, "1.2 Hosting Topologies"),
            e("p", { className: "hint" }, "Add distinct Environment + Site pairs. Stored by Master Library ID with strict uniqueness.")
          ),
          e("button", { type: "button", className: "secondary", onClick: addHostingRow }, e(Icon, { name: "add" }), "+ Add hosting")
        ),

        // Validation banners
        hasDuplicateHosting && e("div", { className: "banner error", style: { margin: "10px 0" } },
          e(Icon, { name: "error" }),
          e("span", null, "Duplicate Environment + Site combination found! Each hosting row must have a unique environment and site.")
        ),
        !hasProductionHosting && e("div", { className: "banner warn", style: { margin: "10px 0" } },
          e(Icon, { name: "warning" }),
          e("span", null, "At least one Production hosting row is required.")
        ),
        sameSiteWarning && e("div", { className: "banner warn", style: { margin: "10px 0" } },
          e(Icon, { name: "crisis_alert" }),
          e("span", null, sameSiteWarning)
        ),

        // Hosting Rows
        form.hosting.map((h, idx) => {
          const isProd = h.environmentId === "env-prod" || h.role === "primary";
          const composite = `${form.name} | ${findEnvName(h.environmentId)} | ${findSiteName(h.siteId)}`;

          return e("div", { className: `hosting-row-card${isProd ? " prod-border" : ""}`, key: h.hostingId || idx },
            e("div", { className: "hosting-row-grid" },
              e(Field, { label: "Environment (from Library)", required: true },
                e(Select, {
                  required: true,
                  value: h.environmentId,
                  onChange: (ev) => updateHostingRow(idx, "environmentId", ev.target.value),
                  options: envLibrary.map((env) => ({ value: env.id, label: env.name })),
                })
              ),
              e(Field, { label: "Site / Location (from Library)", required: true },
                e(Select, {
                  required: true,
                  value: h.siteId,
                  onChange: (ev) => updateHostingRow(idx, "siteId", ev.target.value),
                  options: siteLibrary.map((site) => ({ value: site.id, label: `${site.name} (${site.location || "Cloud"})` })),
                })
              ),
              e(Field, { label: "Topology Role", required: true },
                e(Select, {
                  required: true,
                  value: h.role,
                  onChange: (ev) => updateHostingRow(idx, "role", ev.target.value),
                  options: [
                    { value: "primary", label: "Primary (Production)" },
                    { value: "secondary", label: "Secondary (DR Target)" },
                    { value: "none", label: "None / Standby" },
                  ],
                })
              ),
              e("div", { className: "hosting-remove-col" },
                form.hosting.length > 1 && e("button", {
                  type: "button",
                  className: "icon-btn danger",
                  title: "Remove hosting row",
                  onClick: () => removeHostingRow(idx),
                }, e(Icon, { name: "delete" }))
              )
            ),
            e("div", { className: "composite-label-badge" },
              e("span", { className: "meta-label" }, "Composite reference:"),
              e("code", { className: "composite-tag" }, composite)
            )
          );
        })
      ),

      // Infrastructure Dependencies Section
      e("div", { className: "asset-section", style: { marginTop: 24 } },
        e("div", { className: "card-toolbar" },
          e("div", null,
            e("h3", { style: { margin: 0 } }, "1.3 Infrastructure Dependencies"),
            e("p", { className: "hint" }, "Asset IDs link to the enterprise infrastructure registry.")
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
              e("h4", { style: { margin: 0 } }, `Asset ${i + 1}: ${a.name || "Untitled"}`),
              form.infrastructure.length > 1 && e("button", {
                type: "button",
                className: "secondary",
                onClick: () => set("infrastructure", form.infrastructure.filter((_, j) => j !== i)),
              }, "Remove")
            ),
            e("div", { className: "form-grid two" },
              e(Field, { label: "Asset Name", required: true },
                e("input", { required: true, value: a.name, onChange: (ev) => updateAsset(i, "name", ev.target.value), placeholder: "e.g. PostgreSQL Cluster" })
              ),
              e(Field, { label: "Asset ID (Stable Registry ID)" },
                e("input", { className: "mono", value: a.assetId, onChange: (ev) => updateAsset(i, "assetId", ev.target.value), placeholder: "ci-db-prod-01" })
              ),
              e(Field, { label: "Type", required: true },
                e(Select, { required: true, value: a.type, onChange: (ev) => updateAsset(i, "type", ev.target.value), options: catalogs.assetTypes || ["application", "infrastructure", "datastore", "network", "identity", "third_party"] })
              ),
              e(Field, { label: "Environment", required: true },
                e(Select, { required: true, value: a.environment, onChange: (ev) => updateAsset(i, "environment", ev.target.value), options: catalogs.environments || ["prod", "dr", "nonprod"] })
              ),
              e(Field, { label: "Criticality", required: true },
                e(Select, { required: true, value: a.criticality, onChange: (ev) => updateAsset(i, "criticality", ev.target.value), options: catalogs.criticality || ["high", "medium", "low"] })
              ),
              e(Field, { label: "Technical Owner" },
                e(UserSelect, { users, empty: "(none)", value: a.ownerUserId, onChange: (ev) => updateAsset(i, "ownerUserId", ev.target.value) })
              )
            ),
            e(Field, { label: "Recovery Notes" },
              e("textarea", { value: a.recoveryNotes, onChange: (ev) => updateAsset(i, "recoveryNotes", ev.target.value), placeholder: "Snapshot schedule, replication frequency, failover commands…" })
            )
          )
        )
      ),
      e(Field, { label: "Vendor / Third-Party Dependencies", hint: "Key external services and SLAs" },
        e(ChipInput, { values: form.vendors, onChange: (v) => set("vendors", v), placeholder: "Type vendor name and press Enter" })
      )
    ),

    // ==========================================
    // STEP 2: DR Plan Builder
    // ==========================================
    step === 2 && e("div", { className: "stack", style: { marginTop: 16 } },
      e("div", { className: "card-toolbar", style: { borderBottom: "1px solid var(--line-soft)", paddingBottom: 10 } },
        e("h3", { style: { margin: 0 } }, "2.1 Master DR Plan Header"),
        e("span", { className: "chip" }, `Application: ${form.name}`)
      ),
      e("div", { className: "form-grid two" },
        e(Field, { label: "Plan Title / Name", required: true },
          e("input", { required: true, value: form.title, onChange: (ev) => set("title", ev.target.value) })
        ),
        e(Field, { label: "Plan ID", hint: "System Managed" },
          e("input", { className: "mono", value: form.planId, readOnly: true })
        ),
        e(Field, { label: "Plan Template Used" },
          e(Select, {
            empty: "Select a tier template (optional)",
            value: form.templateId,
            onChange: (ev) => pickTemplate(ev.target.value),
            options: templates.map((t) => ({ value: t.id, label: t.name })),
          })
        ),
        e(Field, { label: "Plan Status", hint: "System-managed" },
          e("input", { value: "Draft (v1)", readOnly: true })
        ),
        e(Field, { label: "Primary Plan Owner", required: true },
          e(UserSelect, { users, required: true, empty: "Select primary owner", value: form.primaryOwnerUserId, onChange: (ev) => set("primaryOwnerUserId", ev.target.value) })
        ),
        e(Field, { label: "Backup Plan Owner" },
          e(UserSelect, { users, empty: "Select backup owner", value: form.backupOwnerUserId, onChange: (ev) => set("backupOwnerUserId", ev.target.value) })
        ),
        // RTO and RPO captured at plan level
        e(Field, { label: "Claimed RTO (hh:mm)", required: true, hint: "Committed Recovery Time Objective" },
          e("input", { className: "mono", placeholder: "02:00", value: form.claimedRto, onChange: (ev) => set("claimedRto", ev.target.value) })
        ),
        e(Field, { label: "Claimed RPO (hh:mm)", required: true, hint: "Committed Recovery Point Objective" },
          e("input", { className: "mono", placeholder: "00:05", value: form.claimedRpo, onChange: (ev) => set("claimedRpo", ev.target.value) })
        )
      ),

      // Hosting Failover Pair Selection
      e("div", { className: "card-toolbar", style: { marginTop: 20 } },
        e("h3", { style: { margin: 0 } }, "2.2 Failover Topology Reference"),
        e("span", { className: "hint" }, "Linked to hosting pairs configured in Step 1")
      ),
      e("div", { className: "form-grid two" },
        e(Field, { label: "Primary Production Site", required: true },
          e(Select, {
            required: true,
            value: form.primaryHostingId || form.hosting[0]?.siteId,
            onChange: (ev) => set("primaryHostingId", ev.target.value),
            options: form.hosting.map((h) => ({
              value: h.siteId,
              label: `${findSiteName(h.siteId)} (${findEnvName(h.environmentId)} · ${pretty(h.role)})`,
            })),
          })
        ),
        e(Field, { label: "Target DR / Failover Site", required: true },
          e(Select, {
            required: true,
            value: form.recoveryHostingId || form.hosting[1]?.siteId || form.hosting[0]?.siteId,
            onChange: (ev) => set("recoveryHostingId", ev.target.value),
            options: form.hosting.map((h) => ({
              value: h.siteId,
              label: `${findSiteName(h.siteId)} (${findEnvName(h.environmentId)} · ${pretty(h.role)})`,
            })),
          })
        )
      ),

      // Recovery Strategy & Failover Details
      e("div", { className: "card-toolbar", style: { marginTop: 20 } },
        e("h3", { style: { margin: 0 } }, "2.3 Strategy & Backup Configuration")
      ),
      e("div", { className: "form-grid two" },
        e(Field, { label: "Recovery Strategy Type", required: true },
          e(Select, {
            required: true,
            value: form.strategy,
            onChange: (ev) => set("strategy", ev.target.value),
            options: catalogs.strategies || ["hot_site", "warm_site", "cold_site", "cloud_dr", "backup_restore"],
          })
        ),
        e(Field, { label: "Failover Method", required: true },
          e(Select, {
            required: true,
            value: form.failoverMethod,
            onChange: (ev) => set("failoverMethod", ev.target.value),
            options: catalogs.failoverMethods || ["manual", "automated", "semi_automated"],
          })
        ),
        e(Field, { label: "Backup Frequency", required: true },
          e(Select, {
            required: true,
            value: form.backupFrequency,
            onChange: (ev) => set("backupFrequency", ev.target.value),
            options: catalogs.backupFrequencies || ["real_time", "hourly", "daily", "weekly"],
          })
        ),
        e(Field, { label: "Backup Retention", required: true },
          e("div", { className: "row", style: { margin: 0 } },
            e("input", { type: "number", min: "1", required: true, value: form.backupRetentionValue, onChange: (ev) => set("backupRetentionValue", ev.target.value) }),
            e(Select, { value: form.backupRetentionUnit, onChange: (ev) => set("backupRetentionUnit", ev.target.value), options: catalogs.retentionUnits || ["days", "hours", "weeks", "months"] })
          )
        )
      ),

      // Scenario Runbooks & Execution Steps
      e("div", { className: "card-toolbar", style: { marginTop: 24 } },
        e("div", null,
          e("h3", { style: { margin: 0 } }, "2.4 Scenario Runbooks & Execution Steps"),
          e("p", { className: "hint" }, "Master plan contains execution runbooks for all major disaster recovery scenarios.")
        ),
        e("button", {
          type: "button",
          className: "secondary",
          onClick: () => setForm((f) => ({ ...f, steps: [...f.steps, emptyStep(f.steps.length + 1)] })),
        }, e(Icon, { name: "add" }), "Add step")
      ),

      // Scenario switcher tabs
      e("div", { className: "scenario-tabs" },
        scenariosLibrary.map((sc) =>
          e("button", {
            key: sc.id,
            type: "button",
            className: `scenario-tab-btn${form.activeScenario === sc.id ? " active" : ""}`,
            onClick: () => set("activeScenario", sc.id),
          }, sc.name)
        )
      ),

      // Steps list
      form.steps.map((s, i) =>
        e("div", { className: "step-card", key: i },
          e("div", { className: "card-toolbar" },
            e("span", { className: "chip" }, `Step ${s.order || i + 1}`),
            form.steps.length > 1 && e("button", {
              type: "button",
              className: "secondary",
              onClick: () => setForm((f) => ({ ...f, steps: f.steps.filter((_, j) => j !== i) })),
            }, "Remove")
          ),
          e("div", { className: "form-grid two" },
            e(Field, { label: "Step Number", required: true },
              e("input", { type: "number", required: true, value: s.order, onChange: (ev) => {
                const next = [...form.steps]; next[i] = { ...s, order: Number(ev.target.value) }; setForm({ ...form, steps: next });
              } })
            ),
            e(Field, { label: "Step Title", required: true },
              e("input", { required: true, value: s.title, onChange: (ev) => {
                const next = [...form.steps]; next[i] = { ...s, title: ev.target.value }; setForm({ ...form, steps: next });
              } })
            ),
            e(Field, { label: "Step Owner / Role", required: true },
              e("input", { required: true, value: s.ownerRole, onChange: (ev) => {
                const next = [...form.steps]; next[i] = { ...s, ownerRole: ev.target.value }; setForm({ ...form, steps: next });
              } })
            ),
            e(Field, { label: "Estimated Duration (Minutes)" },
              e("input", { type: "number", value: s.estimatedDurationMinutes, onChange: (ev) => {
                const next = [...form.steps]; next[i] = { ...s, estimatedDurationMinutes: ev.target.value }; setForm({ ...form, steps: next });
              } })
            ),
            e(Field, { label: "Prerequisite Step(s)" },
              e("input", { value: s.prerequisite, onChange: (ev) => {
                const next = [...form.steps]; next[i] = { ...s, prerequisite: ev.target.value }; setForm({ ...form, steps: next });
              } })
            )
          ),
          e(Field, { label: "Step Instructions", required: true },
            e("textarea", { required: true, rows: 2, value: s.instruction, onChange: (ev) => {
              const next = [...form.steps]; next[i] = { ...s, instruction: ev.target.value }; setForm({ ...form, steps: next });
            } })
          ),
          e(Field, { label: "Rollback Instructions" },
            e("textarea", { rows: 2, value: s.rollback, onChange: (ev) => {
              const next = [...form.steps]; next[i] = { ...s, rollback: ev.target.value }; setForm({ ...form, steps: next });
            } })
          ),
          e(Field, { label: "Verification / Health Check" },
            e("textarea", { rows: 2, value: s.verification, onChange: (ev) => {
              const next = [...form.steps]; next[i] = { ...s, verification: ev.target.value }; setForm({ ...form, steps: next });
            } })
          )
        )
      ),

      // Recovery Team & Contacts
      e("div", { className: "card-toolbar", style: { marginTop: 24 } },
        e("h3", { style: { margin: 0 } }, "2.5 Recovery Team & Contacts"),
        e("button", {
          type: "button",
          className: "secondary",
          onClick: () => setForm((f) => ({ ...f, contacts: [...f.contacts, emptyContact()] })),
        }, e(Icon, { name: "add" }), "Add contact")
      ),
      form.contacts.map((c, i) =>
        e("div", { className: "form-grid two", key: i, style: { background: "var(--surface-low)", padding: 12, borderRadius: "var(--radius)", marginBottom: 10 } },
          e(Field, { label: "Contact Name", required: true },
            e("input", { required: true, value: c.name, onChange: (ev) => {
              const next = [...form.contacts]; next[i] = { ...c, name: ev.target.value }; setForm({ ...form, contacts: next });
            } })
          ),
          e(Field, { label: "Role", required: true },
            e("input", { required: true, value: c.role, onChange: (ev) => {
              const next = [...form.contacts]; next[i] = { ...c, role: ev.target.value }; setForm({ ...form, contacts: next });
            } })
          ),
          e(Field, { label: "Contact Type", required: true },
            e(Select, {
              required: true,
              value: c.contactType,
              onChange: (ev) => {
                const next = [...form.contacts]; next[i] = { ...c, contactType: ev.target.value }; setForm({ ...form, contacts: next });
              },
              options: catalogs.contactTypes || ["primary", "backup", "escalation", "vendor"],
            })
          ),
          e(Field, { label: "Email", required: true },
            e("input", { required: true, type: "email", value: c.email, onChange: (ev) => {
              const next = [...form.contacts]; next[i] = { ...c, email: ev.target.value }; setForm({ ...form, contacts: next });
            } })
          ),
          e(Field, { label: "Phone", required: true },
            e("input", { required: true, value: c.phone, onChange: (ev) => {
              const next = [...form.contacts]; next[i] = { ...c, phone: ev.target.value }; setForm({ ...form, contacts: next });
            } })
          ),
          e(Field, { label: "Escalation Order" },
            e("input", { type: "number", value: c.escalationOrder, onChange: (ev) => {
              const next = [...form.contacts]; next[i] = { ...c, escalationOrder: ev.target.value }; setForm({ ...form, contacts: next });
            } })
          )
        )
      ),

      // Attachments Section
      e("div", { className: "card-toolbar", style: { marginTop: 24 } },
        e("h3", { style: { margin: 0 } }, "2.6 Attachments & Reference Architecture")
      ),
      e("div", { className: "form-grid two" },
        e(Field, { label: "File Name" },
          e("input", { value: form.fileName, onChange: (ev) => set("fileName", ev.target.value), placeholder: "cloud-failover-topology.pdf" })
        ),
        e(Field, { label: "Kind" },
          e(Select, { value: form.attachKind, onChange: (ev) => set("attachKind", ev.target.value), options: catalogs.attachKinds || ["diagram", "config_backup", "vendor_sla"] })
        ),
        e(Field, { label: "Note" },
          e("input", { value: form.attachNote, onChange: (ev) => set("attachNote", ev.target.value), placeholder: "Architecture diagram" })
        )
      )
    )
  );
}
