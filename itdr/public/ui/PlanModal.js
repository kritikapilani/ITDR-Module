import { e, useState, useEffect, api, Field, Select, UserSelect, Modal, Icon, minutesToHhmm, hhmmToMinutes } from "./core.js";

function emptyStep(order) {
  return { stepId: "", order, title: "", instruction: "", ownerRole: "", prerequisite: "", estimatedDurationMinutes: "", rollback: "", verification: "" };
}

function emptyContact() {
  return { role: "", name: "", email: "", phone: "", contactType: "primary", escalationOrder: "" };
}

function fromApp(app) {
  return {
    biaApplicationId: app?.biaApplicationId || "",
    title: app ? `${app.name} technical recovery` : "",
    templateId: "",
    primaryOwnerUserId: app?.primaryOwnerUserId || "",
    backupOwnerUserId: app?.backupOwnerUserId || "",
    claimedRto: minutesToHhmm(app?.objectives?.effectiveRtoMinutes || app?.objectives?.inherited?.rtoMinutes),
    claimedRpo: minutesToHhmm(app?.objectives?.effectiveRpoMinutes || app?.objectives?.inherited?.rpoMinutes),
    strategy: app?.strategy || "",
    primarySite: app?.primarySite || "",
    recoverySite: app?.recoverySite || "",
    backupFrequency: app?.backupFrequency || "",
    backupRetentionValue: app?.backupRetentionValue ?? "",
    backupRetentionUnit: app?.backupRetentionUnit || "days",
    failoverMethod: app?.failoverMethod || "",
    steps: [emptyStep(1)],
    contacts: [emptyContact()],
    fileName: "",
    attachKind: "diagram",
    attachNote: "",
  };
}

function applyTemplate(form, tpl) {
  if (!tpl) return form;
  return {
    ...form,
    templateId: tpl.id,
    strategy: form.strategy || tpl.strategy || "",
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
    contacts: (tpl.contacts || [emptyContact()]).map((c) => ({
      role: c.role || "",
      name: c.name || "",
      email: c.email || "",
      phone: c.phone || "",
      contactType: c.contactType || "primary",
      escalationOrder: c.escalationOrder ?? "",
    })),
  };
}

export function PlanModal({ apps, defaultAppId, catalogs, users, session, onClose, onError, onCreated }) {
  const rows = apps || [];
  const cat = catalogs || {};
  const [templates, setTemplates] = useState([]);
  const [form, setForm] = useState(() => fromApp(rows.find((r) => r.biaApplicationId === defaultAppId) || rows[0]));
  const [busy, setBusy] = useState(false);
  const isAdmin = session?.role === "ADMIN";
  const selected = rows.find((r) => r.biaApplicationId === form.biaApplicationId);

  useEffect(() => {
    api("/api/itdr/templates").then((d) => setTemplates(d.templates || [])).catch(() => setTemplates([]));
  }, []);

  function set(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function pickApp(id) {
    const app = rows.find((r) => r.biaApplicationId === id);
    setForm((f) => ({ ...fromApp(app), templateId: f.templateId, steps: f.steps, contacts: f.contacts }));
  }

  function pickTemplate(id) {
    const tpl = templates.find((t) => t.id === id);
    setForm((f) => applyTemplate({ ...f, templateId: id }, tpl));
  }

  async function submit(ev) {
    ev.preventDefault();
    if (!form.biaApplicationId) {
      onError("Select the linked application");
      return;
    }
    setBusy(true);
    try {
      let created;
      try {
        created = await api(`/api/itdr/targets/${form.biaApplicationId}/plan`, {
          method: "POST",
          body: JSON.stringify({
            title: form.title,
            templateId: form.templateId || undefined,
            strategy: form.strategy || undefined,
            claimedRtoMinutes: hhmmToMinutes(form.claimedRto),
            claimedRpoMinutes: hhmmToMinutes(form.claimedRpo),
            steps: form.steps,
            contacts: form.contacts,
            attachmentsAdd: form.fileName ? [{ fileName: form.fileName, kind: form.attachKind, note: form.attachNote }] : undefined,
          }),
        });
      } catch (err) {
        if (err.status === 409) {
          onError("A draft already exists for this application. Open the runbook to continue, or withdraw it first.");
          setBusy(false);
          return;
        }
        throw err;
      }
      const version = created.draft;
      const patchTarget = {
        strategy: form.strategy || null,
        primarySite: form.primarySite,
        recoverySite: form.recoverySite,
        backupFrequency: form.backupFrequency || null,
        backupRetentionValue: form.backupRetentionValue === "" ? null : Number(form.backupRetentionValue),
        backupRetentionUnit: form.backupRetentionUnit,
        failoverMethod: form.failoverMethod || null,
      };
      if (isAdmin) {
        patchTarget.primaryOwnerUserId = form.primaryOwnerUserId || null;
        patchTarget.backupOwnerUserId = form.backupOwnerUserId || null;
      }
      await api(`/api/itdr/targets/${form.biaApplicationId}`, { method: "PATCH", body: JSON.stringify(patchTarget) });
      if (version) {
        await api(`/api/itdr/versions/${version.versionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            etag: version.etag,
            title: form.title,
            templateId: form.templateId || undefined,
            claimedRtoMinutes: hhmmToMinutes(form.claimedRto),
            claimedRpoMinutes: hhmmToMinutes(form.claimedRpo),
            steps: form.steps,
            contacts: form.contacts,
          }),
        });
      }
      if (onCreated) onCreated(form.biaApplicationId);
      else location.hash = `#target/${form.biaApplicationId}/runbook`;
      onClose();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return e(
    Modal,
    {
      title: "New DR Plan",
      subtitle: "PRD §12.4–12.6. Fill the header, recovery strategy, runbook steps, and contacts. Status and version are system-managed.",
      onClose,
      footer: [
        e("button", { key: "c", type: "button", className: "secondary", onClick: onClose }, "Cancel"),
        e("button", { key: "s", type: "submit", form: "new-plan-form", disabled: busy }, e(Icon, { name: "schema" }), busy ? "Creating…" : "Create draft"),
      ],
    },
    e("form", { id: "new-plan-form", className: "stack", onSubmit: submit },
      e("h3", null, "Plan header"),
      e("div", { className: "form-grid" },
        e(Field, { label: "Linked application", required: true },
          e(Select, {
            required: true,
            empty: "Select application",
            value: form.biaApplicationId,
            onChange: (ev) => pickApp(ev.target.value),
            options: rows.map((r) => ({ value: r.biaApplicationId, label: r.name })),
          })
        ),
        e(Field, { label: "Application ID", hint: "System" }, e("input", { value: form.biaApplicationId, readOnly: true })),
        e(Field, { label: "Plan ID", hint: "Assigned on create" }, e("input", { value: selected?.planId || "Auto-generated", readOnly: true })),
        e(Field, { label: "Plan name", required: true }, e("input", { required: true, value: form.title, onChange: (ev) => set("title", ev.target.value) })),
        e(Field, { label: "Plan owner", required: true }, e(UserSelect, { users, required: true, empty: "Select owner", value: form.primaryOwnerUserId, onChange: (ev) => set("primaryOwnerUserId", ev.target.value) })),
        e(Field, { label: "Backup plan owner" }, e(UserSelect, { users, value: form.backupOwnerUserId, onChange: (ev) => set("backupOwnerUserId", ev.target.value) })),
        e(Field, { label: "Plan template used" }, e(Select, {
          empty: "Use tier default on create",
          value: form.templateId,
          onChange: (ev) => pickTemplate(ev.target.value),
          options: templates.map((t) => ({ value: t.id, label: t.name })),
        })),
        e(Field, { label: "Version number", hint: "System" }, e("input", { value: "Created as draft v1", readOnly: true })),
        e(Field, { label: "Plan status", hint: "System-managed" }, e("input", { value: "draft", readOnly: true })),
        e(Field, { label: "Approval status", hint: "System-managed" }, e("input", { value: "pending", readOnly: true })),
        e(Field, { label: "Claimed RTO (hh:mm)" }, e("input", { placeholder: "02:00", value: form.claimedRto, onChange: (ev) => set("claimedRto", ev.target.value) })),
        e(Field, { label: "Claimed RPO (hh:mm)" }, e("input", { placeholder: "00:05", value: form.claimedRpo, onChange: (ev) => set("claimedRpo", ev.target.value) }))
      ),
      e("h3", null, "Recovery strategy"),
      e("div", { className: "form-grid" },
        e(Field, { label: "Recovery strategy type", required: true }, e(Select, { required: true, empty: "Select strategy", value: form.strategy, onChange: (ev) => set("strategy", ev.target.value), options: cat.strategies })),
        e(Field, { label: "Primary site / location", required: true }, e("input", { required: true, value: form.primarySite, onChange: (ev) => set("primarySite", ev.target.value) })),
        e(Field, { label: "Recovery site / location", required: true }, e("input", { required: true, value: form.recoverySite, onChange: (ev) => set("recoverySite", ev.target.value) })),
        e(Field, { label: "Backup frequency", required: true }, e(Select, { required: true, empty: "Select frequency", value: form.backupFrequency, onChange: (ev) => set("backupFrequency", ev.target.value), options: cat.backupFrequencies })),
        e(Field, { label: "Backup retention", required: true },
          e("div", { className: "row", style: { margin: 0 } },
            e("input", { type: "number", min: "1", required: true, value: form.backupRetentionValue, onChange: (ev) => set("backupRetentionValue", ev.target.value) }),
            e(Select, { value: form.backupRetentionUnit, onChange: (ev) => set("backupRetentionUnit", ev.target.value), options: cat.retentionUnits })
          )
        ),
        e(Field, { label: "Failover method", required: true }, e(Select, { required: true, empty: "Select method", value: form.failoverMethod, onChange: (ev) => set("failoverMethod", ev.target.value), options: cat.failoverMethods }))
      ),
      e("div", { className: "card-toolbar" },
        e("h3", { style: { margin: 0 } }, "Runbook steps"),
        e("button", { type: "button", className: "secondary", onClick: () => setForm((f) => ({ ...f, steps: [...f.steps, emptyStep(f.steps.length + 1)] })) }, e(Icon, { name: "add" }), "Add step")
      ),
      form.steps.map((s, i) =>
        e("div", { className: "step-card", key: i },
          e("div", { className: "form-grid" },
            e(Field, { label: "Step number", required: true }, e("input", { type: "number", required: true, value: s.order, onChange: (ev) => {
              const steps = [...form.steps]; steps[i] = { ...s, order: Number(ev.target.value) }; setForm({ ...form, steps });
            } })),
            e(Field, { label: "Step title", required: true }, e("input", { required: true, value: s.title, onChange: (ev) => {
              const steps = [...form.steps]; steps[i] = { ...s, title: ev.target.value }; setForm({ ...form, steps });
            } })),
            e(Field, { label: "Step owner / role", required: true }, e("input", { required: true, value: s.ownerRole, onChange: (ev) => {
              const steps = [...form.steps]; steps[i] = { ...s, ownerRole: ev.target.value }; setForm({ ...form, steps });
            } })),
            e(Field, { label: "Estimated duration (minutes)" }, e("input", { type: "number", value: s.estimatedDurationMinutes, onChange: (ev) => {
              const steps = [...form.steps]; steps[i] = { ...s, estimatedDurationMinutes: ev.target.value }; setForm({ ...form, steps });
            } })),
            e(Field, { label: "Prerequisite step(s)" }, e("input", { value: s.prerequisite, onChange: (ev) => {
              const steps = [...form.steps]; steps[i] = { ...s, prerequisite: ev.target.value }; setForm({ ...form, steps });
            } }))
          ),
          e(Field, { label: "Step description", required: true }, e("textarea", { required: true, value: s.instruction, onChange: (ev) => {
            const steps = [...form.steps]; steps[i] = { ...s, instruction: ev.target.value }; setForm({ ...form, steps });
          } })),
          e(Field, { label: "Rollback instructions" }, e("textarea", { value: s.rollback, onChange: (ev) => {
            const steps = [...form.steps]; steps[i] = { ...s, rollback: ev.target.value }; setForm({ ...form, steps });
          } })),
          e(Field, { label: "Verification / check" }, e("textarea", { value: s.verification, onChange: (ev) => {
            const steps = [...form.steps]; steps[i] = { ...s, verification: ev.target.value }; setForm({ ...form, steps });
          } }))
        )
      ),
      e("div", { className: "card-toolbar" },
        e("h3", { style: { margin: 0 } }, "Recovery team and contacts"),
        e("button", { type: "button", className: "secondary", onClick: () => setForm((f) => ({ ...f, contacts: [...f.contacts, emptyContact()] })) }, e(Icon, { name: "add" }), "Add contact")
      ),
      form.contacts.map((c, i) =>
        e("div", { className: "form-grid", key: i },
          e(Field, { label: "Contact name", required: true }, e("input", { required: true, value: c.name, onChange: (ev) => {
            const contacts = [...form.contacts]; contacts[i] = { ...c, name: ev.target.value }; setForm({ ...form, contacts });
          } })),
          e(Field, { label: "Role", required: true }, e("input", { required: true, value: c.role, onChange: (ev) => {
            const contacts = [...form.contacts]; contacts[i] = { ...c, role: ev.target.value }; setForm({ ...form, contacts });
          } })),
          e(Field, { label: "Contact type", required: true }, e(Select, { required: true, value: c.contactType, onChange: (ev) => {
            const contacts = [...form.contacts]; contacts[i] = { ...c, contactType: ev.target.value }; setForm({ ...form, contacts });
          }, options: cat.contactTypes })),
          e(Field, { label: "Email", required: true }, e("input", { required: true, type: "email", value: c.email, onChange: (ev) => {
            const contacts = [...form.contacts]; contacts[i] = { ...c, email: ev.target.value }; setForm({ ...form, contacts });
          } })),
          e(Field, { label: "Phone", required: true }, e("input", { required: true, value: c.phone, onChange: (ev) => {
            const contacts = [...form.contacts]; contacts[i] = { ...c, phone: ev.target.value }; setForm({ ...form, contacts });
          } })),
          e(Field, { label: "Escalation order" }, e("input", { type: "number", value: c.escalationOrder, onChange: (ev) => {
            const contacts = [...form.contacts]; contacts[i] = { ...c, escalationOrder: ev.target.value }; setForm({ ...form, contacts });
          } }))
        )
      ),
      e("h3", null, "Attachments"),
      e("div", { className: "form-grid" },
        e(Field, { label: "File name" }, e("input", { value: form.fileName, onChange: (ev) => set("fileName", ev.target.value), placeholder: "network-diagram.pdf" })),
        e(Field, { label: "Kind" }, e(Select, { value: form.attachKind, onChange: (ev) => set("attachKind", ev.target.value), options: cat.attachKinds })),
        e(Field, { label: "Note" }, e("input", { value: form.attachNote, onChange: (ev) => set("attachNote", ev.target.value) }))
      )
    )
  );
}
