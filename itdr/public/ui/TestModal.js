import { e, useState, api, Field, Select, UserSelect, Modal, Icon, minutesToHhmm, hhmmToMinutes, parseDuration, toIso, toDateInput, pretty } from "./core.js";

const LIVE_QUESTIONS = [
  { id: "procedureFollowed", text: "Was the recovery procedure executed exactly as documented in the runbook?", options: ["yes", "no", "partial"] },
  { id: "rtoMet", text: "Was the target RTO met?", options: ["yes", "no"] },
  { id: "rpoMet", text: "Was the target RPO met?", options: ["yes", "no"] },
  { id: "noManualIntervention", text: "Did the failover/recovery complete without manual intervention outside the documented steps?", options: ["yes", "no"] },
  { id: "contactsReachable", text: "Were all listed recovery team contacts reachable and responsive?", options: ["yes", "no"] },
  { id: "dataLossBeyondRpo", text: "Was any data loss or corruption observed beyond the target RPO?", options: ["yes", "no"] },
  { id: "functionalChecksPassed", text: "Did the recovered system pass functional/validation checks before cutover?", options: ["yes", "no"] },
  { id: "outdatedSteps", text: "Were any runbook steps found to be outdated, missing, or incorrect?", options: ["yes", "no"], followUp: true },
];

const TABLETOP_QUESTIONS = [
  { id: "rolesAgreed", text: "Did all participants agree on their roles and responsibilities during the walkthrough?", options: ["yes", "no"] },
  { id: "stepsIdentified", text: "Could the team identify every step needed to recover, without gaps in the discussion?", options: ["yes", "no"] },
  { id: "contactsConfirmed", text: "Were all listed contacts confirmed reachable (not tested live, just confirmed correct)?", options: ["yes", "no"] },
  { id: "planPlausible", text: "Did the team believe the documented plan could plausibly meet the target RTO/RPO?", options: ["yes", "no", "unsure"] },
  { id: "outdatedSteps", text: "Were any runbook steps found to be outdated, missing, or incorrect in discussion?", options: ["yes", "no"], followUp: true },
];

function questionsFor(mode) {
  return mode === "tabletop" ? TABLETOP_QUESTIONS : LIVE_QUESTIONS;
}

function optionLabel(value) {
  if (value === "partial") return "Partially";
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (value === "unsure") return "Unsure";
  return pretty(value);
}

function deriveOutcome(mode, answers) {
  const a = answers || {};
  if (mode === "tabletop") {
    if (a.planPlausible === "no") return "fail";
    const keys = TABLETOP_QUESTIONS.map((q) => q.id);
    if (!keys.every((k) => a[k])) return a.outdatedSteps === "yes" ? "partial" : "pending";
    if (a.planPlausible === "yes" && a.outdatedSteps === "no") return "pass";
    if (a.outdatedSteps === "yes" || a.planPlausible === "unsure") return "partial";
    return "pending";
  }
  if (a.rtoMet === "no" || a.rpoMet === "no" || a.dataLossBeyondRpo === "yes") return "fail";
  const keys = LIVE_QUESTIONS.map((q) => q.id);
  if (!keys.every((k) => a[k])) {
    if (a.outdatedSteps === "yes" || a.procedureFollowed === "partial") return "partial";
    return "pending";
  }
  const rtoRpoMet = a.rtoMet === "yes" && a.rpoMet === "yes";
  if (!rtoRpoMet) return "fail";
  const unresolved = a.functionalChecksPassed === "no" || a.outdatedSteps === "yes";
  if (rtoRpoMet && !unresolved && a.procedureFollowed !== "partial" && a.procedureFollowed !== "no") return "pass";
  if (rtoRpoMet && (unresolved || a.procedureFollowed === "partial" || a.procedureFollowed === "no")) return "partial";
  return "pending";
}

function todayDate() {
  return toDateInput(new Date().toISOString()) || new Date().toISOString().slice(0, 10);
}

function plusDays(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function outcomeMeta(outcome) {
  if (outcome === "pass") return { status: "ready", label: "Pass" };
  if (outcome === "partial") return { status: "in_progress", label: "Partial" };
  if (outcome === "fail") return { status: "failed_test", label: "Fail" };
  return { status: "not_started", label: "Pending" };
}

function emptySched() {
  return {
    testType: "DR_TEST",
    targetBiaApplicationId: "",
    planVersionId: "",
    ownerUserId: "",
    scheduledAt: "",
    dueAt: "",
    targetRto: "",
    targetRpo: "",
    exerciseMode: "tabletop",
    participants: [],
  };
}

function emptyResult(session, test) {
  return {
    testId: test?.testId || "",
    exerciseMode: test?.exerciseMode || "tabletop",
    planVersionId: test?.planVersionId || "",
    targetBiaApplicationId: test?.targetBiaApplicationId || "",
    actualRto: "",
    actualRpo: "",
    targetRto: minutesToHhmm(test?.targetRtoMinutes),
    targetRpo: minutesToHhmm(test?.targetRpoMinutes),
    completedAt: toDateInput(test?.scheduledAt) || todayDate(),
    participants: [...(test?.participants || [])],
    gapsIssues: "",
    answers: {},
    outdatedStepsNote: "",
    remediationRequired: false,
    remediationTouched: false,
    retestDueAt: "",
  };
}

function Seg({ value, options, onChange, disabled }) {
  return e(
    "div",
    { className: "seg", role: "group" },
    (options || []).map((opt) => {
      const v = typeof opt === "string" ? opt : opt.value;
      const label = typeof opt === "string" ? optionLabel(opt) : opt.label;
      return e("button", {
        key: v,
        type: "button",
        className: value === v ? "on" : "",
        disabled,
        onClick: () => onChange(v),
      }, label);
    })
  );
}

function participantPeople(users, test, recoveryTeam) {
  const items = [];
  const seen = new Set();
  const invited = new Set(test?.participants || []);
  for (const c of recoveryTeam || []) {
    const match = (users || []).find((u) =>
      (c.email && u.email && u.email === c.email) ||
      (c.name && u.displayName && u.displayName.toLowerCase() === String(c.name).toLowerCase())
    );
    const id = match?.userId || (c.name ? `contact:${c.name}` : "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, label: match?.displayName || c.name, invited: invited.has(match?.userId) || invited.has(id) });
  }
  if (!items.length) {
    for (const u of users || []) {
      if (seen.has(u.userId)) continue;
      seen.add(u.userId);
      items.push({ id: u.userId, label: u.displayName, invited: invited.has(u.userId) });
    }
  } else {
    for (const id of invited) {
      if (seen.has(id)) continue;
      const u = (users || []).find((x) => x.userId === id);
      seen.add(id);
      items.push({ id, label: u?.displayName || id, invited: true });
    }
  }
  return items;
}

export function ScheduleTestModal({ catalog, tests, session, onClose, onError, onCreated }) {
  const apps = catalog.applications || [];
  const users = catalog.users || [];
  const modes = catalog.exerciseModes || catalog.catalogs?.exerciseModes || ["tabletop", "simulation", "full_failover"];
  const [form, setForm] = useState(emptySched);
  const [busy, setBusy] = useState(false);

  function set(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function submit(ev) {
    ev.preventDefault();
    setBusy(true);
    try {
      const app = apps.find((a) => a.biaApplicationId === form.targetBiaApplicationId);
      if (!form.participants.length) throw new Error("Participants are required");
      await api("/api/testing/tests", {
        method: "POST",
        body: JSON.stringify({
          testType: form.testType,
          planVersionId: form.planVersionId || undefined,
          targetBiaApplicationId: form.targetBiaApplicationId || undefined,
          ownerUserId: form.ownerUserId || undefined,
          scheduledAt: toIso(form.scheduledAt),
          dueAt: toIso(form.dueAt),
          exerciseMode: form.exerciseMode || undefined,
          targetRtoMinutes: hhmmToMinutes(form.targetRto) ?? app?.targetRtoMinutes,
          targetRpoMinutes: hhmmToMinutes(form.targetRpo) ?? app?.targetRpoMinutes,
          participants: form.participants,
        }),
      });
      onCreated?.();
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
      title: "Schedule DR Test",
      subtitle: "PRD §12.7 pre-test fields. The test is stored in Testing; ITDR readiness stays derived.",
      onClose,
      footer: [
        e("button", { key: "c", type: "button", className: "secondary", onClick: onClose }, "Cancel"),
        e("button", { key: "s", type: "submit", form: "sched-test-form", disabled: busy }, e(Icon, { name: "event_note" }), busy ? "Scheduling…" : "Schedule test"),
      ],
    },
    e("form", { id: "sched-test-form", className: "stack", onSubmit: submit },
      e("h3", null, "Test record"),
      e("div", { className: "form-grid" },
        e(Field, { label: "Test record ID", hint: "Assigned on create" }, e("input", { value: "Auto-generated", readOnly: true })),
        e(Field, { label: "Test type", required: true }, e(Select, { required: true, value: form.testType, onChange: (ev) => set("testType", ev.target.value), options: (catalog.types || []).map((t) => ({ value: t.code, label: t.label })) })),
        e(Field, { label: "Linked application", required: true }, e(Select, {
          required: true, empty: "Select application", value: form.targetBiaApplicationId,
          onChange: (ev) => {
            const app = apps.find((a) => a.biaApplicationId === ev.target.value);
            setForm((f) => ({
              ...f,
              targetBiaApplicationId: ev.target.value,
              planVersionId: app?.currentApprovedVersionId || "",
              targetRto: minutesToHhmm(app?.targetRtoMinutes) || f.targetRto,
              targetRpo: minutesToHhmm(app?.targetRpoMinutes) || f.targetRpo,
            }));
          },
          options: apps.map((a) => ({ value: a.biaApplicationId, label: a.name })),
        })),
        e(Field, { label: "Linked DR plan", required: true }, e(Select, {
          required: form.testType === "DR_TEST",
          empty: "Select approved plan version",
          value: form.planVersionId,
          onChange: (ev) => set("planVersionId", ev.target.value),
          options: apps
            .filter((a) => !form.targetBiaApplicationId || a.biaApplicationId === form.targetBiaApplicationId)
            .filter((a) => a.currentApprovedVersionId)
            .map((a) => ({ value: a.currentApprovedVersionId, label: `${a.name} · ${a.currentApprovedVersionId}` })),
        })),
        e(Field, { label: "Exercise mode", required: true }, e(Select, { required: true, value: form.exerciseMode, onChange: (ev) => set("exerciseMode", ev.target.value), options: modes })),
        e(Field, { label: "Test owner" }, e(UserSelect, { users, value: form.ownerUserId, onChange: (ev) => set("ownerUserId", ev.target.value) })),
        e(Field, { label: "Scheduled date", required: true }, e("input", { type: "datetime-local", required: true, value: form.scheduledAt, onChange: (ev) => set("scheduledAt", ev.target.value) })),
        e(Field, { label: "Target RTO (hh:mm)", required: true }, e("input", { required: true, placeholder: "02:00", value: form.targetRto, onChange: (ev) => set("targetRto", ev.target.value) })),
        e(Field, { label: "Target RPO (hh:mm)", required: true }, e("input", { required: true, placeholder: "00:05", value: form.targetRpo, onChange: (ev) => set("targetRpo", ev.target.value) })),
        e(Field, { label: "Re-cert / re-test due" }, e("input", { type: "datetime-local", value: form.dueAt, onChange: (ev) => set("dueAt", ev.target.value) }))
      ),
      e("p", { className: "muted" }, "Participants"),
      e("div", { className: "row" }, users.map((u) =>
        e("label", { key: u.userId, className: "flag" },
          e("input", { type: "checkbox", checked: form.participants.includes(u.userId), onChange: () => setForm((s) => ({ ...s, participants: s.participants.includes(u.userId) ? s.participants.filter((id) => id !== u.userId) : [...s.participants, u.userId] })) }),
          ` ${u.displayName}`
        )
      )),
      tests?.length ? e("p", { className: "muted" }, `${tests.length} existing test(s) on the calendar.`) : null
    )
  );
}

export function RecordResultModal({ catalog, tests, session, defaultTestId, onClose, onError, onCreated }) {
  const users = catalog.users || [];
  const apps = catalog.applications || [];
  const modes = [
    { value: "tabletop", label: "Tabletop" },
    { value: "simulation", label: "Simulation" },
    { value: "full_failover", label: "Full Failover" },
  ];
  const open = (tests || []).filter((t) => t.status !== "completed");
  const seed = (tests || []).find((t) => t.testId === defaultTestId) || open[0];
  const [form, setForm] = useState(() => emptyResult(session, seed));
  const [busy, setBusy] = useState(false);

  const selected = (tests || []).find((t) => t.testId === form.testId) || seed;
  const app = apps.find((a) => a.biaApplicationId === (form.targetBiaApplicationId || selected?.targetBiaApplicationId));
  const people = participantPeople(users, selected, app?.recoveryTeam);
  const tabletop = form.exerciseMode === "tabletop";
  const questions = questionsFor(form.exerciseMode);
  const outcome = deriveOutcome(form.exerciseMode, form.answers);
  const meta = outcomeMeta(outcome);
  const autoRemediation = outcome === "fail" || outcome === "partial";
  const remediationOn = form.remediationTouched ? form.remediationRequired : autoRemediation;

  function set(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  function answer(id, value) {
    setForm((f) => ({ ...f, answers: { ...f.answers, [id]: value } }));
  }

  function pickTest(testId) {
    const t = (tests || []).find((x) => x.testId === testId);
    setForm(emptyResult(session, t));
  }

  async function submit(ev) {
    ev.preventDefault();
    setBusy(true);
    try {
      if (!form.testId) throw new Error("Select an open test");
      if (!form.participants.length) throw new Error("Participants are required");
      if (!form.completedAt) throw new Error("Actual test date is required");
      const unanswered = questions.filter((q) => !form.answers[q.id]);
      if (unanswered.length) throw new Error("Answer every structured question before saving");
      if (form.answers.outdatedSteps === "yes" && !String(form.outdatedStepsNote || "").trim()) {
        throw new Error("Describe which runbook steps are outdated, missing, or incorrect");
      }
      if (outcome === "pending") throw new Error("Overall result is still pending — finish the question set");
      if (!tabletop) {
        if (parseDuration(form.actualRto) == null) throw new Error("Actual RTO achieved is required");
        if (parseDuration(form.actualRpo) == null) throw new Error("Actual RPO achieved is required");
      }
      const rem = remediationOn;
      await api(`/api/testing/tests/${form.testId}/complete`, {
        method: "POST",
        body: JSON.stringify({
          outcome,
          exerciseMode: form.exerciseMode,
          planVersionId: form.planVersionId || null,
          actualRtoMinutes: tabletop ? null : parseDuration(form.actualRto),
          actualRpoMinutes: tabletop ? null : parseDuration(form.actualRpo),
          targetRtoMinutes: hhmmToMinutes(form.targetRto),
          targetRpoMinutes: hhmmToMinutes(form.targetRpo),
          completedAt: toIso(form.completedAt),
          participants: form.participants,
          gapsIssues: form.gapsIssues,
          remediationRequired: rem,
          retestDueAt: rem && form.retestDueAt ? toIso(form.retestDueAt) : rem ? toIso(plusDays(90)) : undefined,
          questionnaire: {
            answers: form.answers,
            notes: { outdatedSteps: form.outdatedStepsNote || "" },
          },
          stepResults: [],
        }),
      });
      onCreated?.();
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
      className: "modal-record",
      title: "Record test result",
      subtitle: "PRD §12.7 post-test fields. Readiness stays derived in ITDR from this evidence.",
      onClose,
      footer: [
        e("button", { key: "c", type: "button", className: "secondary", onClick: onClose }, "Cancel"),
        e("button", { key: "s", type: "submit", form: "record-result-form", className: "ink", disabled: busy }, e(Icon, { name: "task_alt" }), busy ? "Saving…" : "Save result"),
      ],
    },
    e("form", { id: "record-result-form", className: "stack record-form", onSubmit: submit },
      e("div", { className: "result-banner" },
        e("div", null,
          e("div", { className: "field-label" }, e("span", null, "Overall result")),
          e("p", { className: "hint", title: "Pass requires RTO and RPO met, no data-loss or failed functional checks, and no outdated-steps flag." }, "Auto-derived from responses below")
        ),
        e("span", { className: `result-pill pill st-${meta.status}` }, meta.label)
      ),

      open.length > 1 || !form.testId
        ? e(Field, { label: "Open test", required: true }, e(Select, {
            required: true,
            empty: open.length ? "Select test" : "No open tests — schedule one first",
            value: form.testId,
            onChange: (ev) => pickTest(ev.target.value),
            options: open.map((t) => ({ value: t.testId, label: `${t.testId} · ${t.testType}` })),
          }))
        : e("div", { className: "form-grid two" },
            e(Field, { label: "Test record ID" }, e("input", { className: "mono", value: form.testId || "—", readOnly: true })),
            e(Field, { label: "Linked DR plan" }, e("input", { className: "mono", value: form.planVersionId || "—", readOnly: true }))
          ),

      e(Field, { label: "Exercise mode", required: true },
        e(Seg, {
          value: form.exerciseMode,
          options: modes,
          onChange: (v) => setForm((f) => ({ ...f, exerciseMode: v, answers: {}, outdatedStepsNote: "" })),
        })
      ),

      e("h3", null, "Actual result summary"),
      e("div", { className: "form-grid" },
        e(Field, { label: "Actual test date", required: true },
          e("input", { type: "date", required: true, value: form.completedAt, onChange: (ev) => set("completedAt", ev.target.value) })
        ),
        e(Field, {
          label: "Actual RTO achieved",
          hint: tabletop ? "Not applicable for Tabletop exercises" : "e.g. 3h 20m",
        },
          e("input", {
            className: "mono",
            placeholder: tabletop ? "N/A" : "3h 20m",
            value: tabletop ? "" : form.actualRto,
            disabled: tabletop,
            readOnly: tabletop,
            onChange: (ev) => set("actualRto", ev.target.value),
          })
        ),
        e(Field, {
          label: "Actual RPO achieved",
          hint: tabletop ? "Not applicable for Tabletop exercises" : "e.g. 0h 15m",
        },
          e("input", {
            className: "mono",
            placeholder: tabletop ? "N/A" : "0h 15m",
            value: tabletop ? "" : form.actualRpo,
            disabled: tabletop,
            readOnly: tabletop,
            onChange: (ev) => set("actualRpo", ev.target.value),
          })
        )
      ),

      e("h3", null, "Structured questions"),
      e("div", { className: "q-list" },
        questions.map((q) =>
          e("div", { className: "q-row", key: q.id },
            e("p", { className: "q-text" }, q.text),
            e(Seg, { value: form.answers[q.id] || "", options: q.options, onChange: (v) => answer(q.id, v) }),
            q.followUp && form.answers[q.id] === "yes"
              ? e("div", { className: "q-follow" },
                  e(Field, { label: "Which steps, and what changed?", required: true },
                    e("textarea", {
                      required: true,
                      rows: 3,
                      placeholder: "List the step numbers or titles and the correction needed",
                      value: form.outdatedStepsNote,
                      onChange: (ev) => set("outdatedStepsNote", ev.target.value),
                    })
                  )
                )
              : null
          )
        )
      ),

      e("h3", null, "Remediation"),
      e("label", { className: "flag" },
        e("input", {
          type: "checkbox",
          checked: remediationOn,
          onChange: (ev) => setForm((f) => ({
            ...f,
            remediationTouched: true,
            remediationRequired: ev.target.checked,
            retestDueAt: ev.target.checked ? (f.retestDueAt || plusDays(90)) : f.retestDueAt,
          })),
        }),
        " Remediation required"
      ),
      autoRemediation && !form.remediationTouched
        ? e("p", { className: "hint" }, "Auto-checked from a Fail or Partial result — you can override.")
        : null,
      remediationOn
        ? e(Field, { label: "Re-test due date", required: true },
            e("input", {
              type: "date",
              required: true,
              value: form.retestDueAt || plusDays(90),
              onChange: (ev) => setForm((f) => ({ ...f, retestDueAt: ev.target.value, remediationTouched: true, remediationRequired: true })),
            })
          )
        : null,

      e("h3", null, "Participants"),
      e("div", { className: "participant-pills" },
        people.map((p) =>
          e("label", { key: p.id, className: `part-pill${form.participants.includes(p.id) ? " on" : ""}` },
            e("input", {
              type: "checkbox",
              checked: form.participants.includes(p.id),
              onChange: () => setForm((s) => ({
                ...s,
                participants: s.participants.includes(p.id)
                  ? s.participants.filter((id) => id !== p.id)
                  : [...s.participants, p.id],
              })),
            }),
            p.label
          )
        )
      ),

      e(Field, { label: "Gaps / issues identified" },
        e("textarea", {
          rows: 4,
          placeholder: "Describe anything that failed, took longer than expected, or needs follow-up",
          value: form.gapsIssues,
          onChange: (ev) => set("gapsIssues", ev.target.value),
        })
      )
    )
  );
}
