# ITDR Module — Implementation Plan

This plan turns `PRD`, `context.md`, and `architecture.md` into sequenced delivery work. Product scope and release packaging follow the **PRD**. Technical contracts, data ownership, and derived readiness follow **architecture.md**. Problem framing follows **context.md**.

Crisis Management invocation is **not in this phase**. Plan records must still be linkage-compatible with BCP's process/asset structure (PRD FR-2 / Section 7.5 minimum).

---

## 1. How the source documents are applied

| Question | Source of truth |
|---|---|
| What to build and how success is measured | PRD |
| What ITDR must not own or duplicate | context.md + PRD §3 / §5 |
| Entities, ownership, integration contracts, readiness derivation | architecture.md |
| Release packaging | PRD §11 (this plan's phases) |

### Phasing reconciliation

The PRD splits Testing and reporting later than the architecture's "close the evidence gap in one phase." This plan **keeps the PRD's three product phases** and **builds the architecture incrementally** so Phase 2 is not a rewrite:

- **Phase 1** ships the system of record for targets, assets, plans, versions, and approvals. A **partial readiness model** is implemented now (coverage, approval, currency, BIA alignment). Users cannot set "ready" by hand.
- **Phase 2** adds the Testing contract and the **full operational dashboard** (adds the test dimension to the same readiness engine).
- **Phase 3** adds ISO-mapped compliance packs, gap analysis, and advanced CMDB/ITSM sync.
- **Future** is Crisis invocation, after the assessment in PRD §7.5 / §10.

---

## 2. Constraints that every increment must obey

1. **Integrate, do not replace** BIA, BCP, Crisis Management, or Testing.
2. **BIA is authoritative** for process-to-application mapping and inherited RTO/RPO. ITDR never re-keys that catalogue.
3. **Readiness is derived** (plan + approval + later test + BIA alignment). No user-toggled "ready" flag.
4. **Approved plan versions snapshot** BIA RTO/RPO and mapping. Later BIA changes create **drift**, they do not silently rewrite history.
5. **A DR Test counts only if bound to a Plan Version ID.**
6. **Secrets stay out of runbooks** — store references, not credentials.
7. **Reuse BCM platform** identity, tenancy, RBAC, notifications, and audit log.
8. **Default grain:** one DR plan per BIA application / recovery target (architecture §10.4) unless grouping is later approved.

---

## 3. Delivery map (PRD phases → architecture slices)

```
Sprint 0     Discovery, contracts, platform spike
Phase 1      Foundational data + plan lifecycle + partial readiness
Phase 2      Testing integration + operational dashboard
Phase 3      Compliance reporting + gap analysis + advanced CMDB
Future       Crisis invocation (conditional)
```

| PRD phase | Architecture slices delivered | PRD FRs | Integrations |
|---|---|---|---|
| 0 — Discovery | Contracts, IDs, policy defaults, BCM module shell | Unblocks FR-1, FR-3, FR-11, FR-14, FR-22–26 | BIA / Testing / BCP / Crisis / CMDB discovery |
| 1 — Foundation | Recovery target, asset graph, plan/version/approval, BIA inherit + drift, BCP link, Crisis-compatible shape, partial readiness | FR-1–13, FR-19 (plan review window), FR-21, FR-30; FR-2 Crisis-compatible linkage | BIA in, BCP in, CMDB in (or native + adapter), Crisis shape only |
| 2 — Evidence loop | DR Test type, test-due trigger, result ingest, remediation flags, full readiness, dashboard + drill-down, recertification reminders | FR-14–20, FR-27, FR-28 | Testing bidirectional |
| 3 — Audit + inventory depth | ISO 22301 / 27031 reports, gap analysis, advanced CMDB/ITSM | FR-29, FR-1 (advanced), FR-27 depth | CMDB/ITSM advanced |
| Future | Invocation, live step checkoff, post-mortem actuals | FR-22–26 | Crisis bidirectional |

---

## 4. Sprint 0 — Discovery and unblockers

Do this before committing schema. Open questions in PRD §10 and architecture §10 are **build gates**, not backlog comments.

### 4.1 Decisions to lock

| ID | Decision | Needed for | Default if not decided by end of Sprint 0 |
|---|---|---|---|
| D1 | Authoritative IT asset inventory: native BCM vs CMDB/ServiceNow | FR-1 | Native ITDR inventory **plus** a CMDB adapter interface; sync is Phase 3 if source is unclear |
| D2 | BIA application identity: stable ID, grain, RTO/RPO roll-up across processes | FR-2, FR-3 | Most demanding (lowest) RTO and RPO among linked processes; one target per BIA application ID |
| D3 | How Testing registers a new test type and binds `planVersionId` | FR-14–17 | Event/API contract drafted in Sprint 0; implementation in Phase 2 |
| D4 | Recertification window by tier | FR-15, FR-19, FR-20 | Configurable policy object; seed **12 months** for all tiers until BCM policy is confirmed |
| D5 | Approval authority: single reviewer vs multi-step | FR-11 | Single `approver` role, segregation of duties (author ≠ approver); workflow engine must allow extra steps later |
| D6 | Crisis invocation: generic vs BCP-hardcoded | FR-22–26, shape of FR-2 | Assume **unknown**. Match BCP plan-to-process/asset linkage. No invocation UI |
| D7 | Whether smaller outages may invoke from ITDR | PRD §10 | No. Invocation remains Crisis-owned |

### 4.2 Technical spikes

1. **BCM module shell** — routing, nav, RBAC hooks, audit interceptor, notification bus, tenancy.
2. **BIA read adapter** — query applications, process mapping, RTO/RPO; confirm fields and change events (or poll).
3. **BCP linkage** — how BCP stores process/asset links; copy that shape for DR plans (PRD §7.5 minimum).
4. **Testing extensibility** — add test type, custom fields, inbound result callback, outbound "create test record."
5. **Crisis plan record shape** — list fields the BCP invocation lookup uses; ensure DR plan persistence includes them.
6. **CMDB** — identify system of record and a minimum sync payload (application, tech owner, CI relationships).

### 4.3 Sprint 0 exit criteria

- Written contracts (even if mocked): BIA read, Testing test-type + results, BCP link reference, Crisis-compatible plan fields.
- D1–D7 recorded with owner and date.
- Empty ITDR module runs inside BCM with RBAC roles stubbed: Plan Owner, Reviewer/Approver, Auditor, Admin, Executive (PRD FR-30). Test Manager uses Testing, not a duplicate ITDR scheduler role.
- No production schema locked that contradicts D2 or D6.

---

## 5. Phase 1 — Foundational data and plan lifecycle

**Outcome:** Every in-scope BIA application can be a recovery target with owners, strategy, dependencies, and a versioned, approvable DR runbook. Coverage and plan currency are visible. Crisis invocation is not built; plan data is shaped so it could be.

**Success metrics touched:** % of Tier 1/2 applications with an approved, non-expired DR plan (coverage/currency only — "tested" is Phase 2). Time to produce a *plan inventory* report starts here; full compliance pack is Phase 3.

### 5.1 Workstream A — Platform and security

| Task | Detail | Done when |
|---|---|---|
| A1 Module shell | ITDR area in BCM: routes, navigation, feature flag | Admin can open ITDR; other modules unchanged |
| A2 RBAC | Roles from FR-30; Plan Owner edits drafts of assigned targets; Approver cannot approve own draft if D5 requires SoD; Auditor read+export; Executive aggregated views | Unauthorized actions return 403 and are audited |
| A3 Audit log | Append-only trail on plan, version, approval, owner, RTO override, asset/dependency changes | Auditor can reconstruct who changed what |
| A4 Notifications | Use BCM notification bus: assignment, review requested, approved, rejected | No ITDR-specific mail engine |

### 5.2 Workstream B — Recovery targets and BIA inheritance

| Task | Detail | FRs | Done when |
|---|---|---|---|
| B1 RecoveryTarget | Entity bound to BIA application ID; ITDR-owned: owners, strategy, tier, assets | FR-1, FR-6 | Target cannot exist without BIA application ID |
| B2 Seed from BIA | Ingest/list BIA applications in scope; do not type a parallel app catalogue | FR-2, FR-3 | Coverage list = BIA apps minus plans |
| B3 Inherit RTO/RPO | Display live BIA values; roll-up per D2 | FR-3 | Inherited values are read-only by default |
| B4 Override with justification | Application-level override; reason required; logged | FR-4 | Override never writes back to BIA; audit shows before/after |
| B5 Process mapping display | Show BIA process links on the target; missing mapping is a **BIA gap**, not an ITDR edit | FR-2 | No process master data in ITDR |
| B6 BCP reference | Read-only link to related BCP plan ID(s) | PRD §8 | BCP content is not copied |
| B7 Snapshot-on-approve | Copy mapping + RTO/RPO (+ override if any) onto Plan Version at approval | architecture §4.4 | Historical versions do not change when BIA changes |
| B8 Drift detection | Compare live BIA vs snapshot vs claimed capability; flag `bia_drift` | architecture §4.6, §5.1 | Approved plan body is not auto-edited |

### 5.3 Workstream C — Assets and dependencies

| Task | Detail | FRs | Done when |
|---|---|---|---|
| C1 Asset inventory | Native store for CIs needed for DR: app, infra, data store, network/identity, third party | FR-1 | Assets attach to a recovery target |
| C2 CMDB adapter (interface) | Inbound port for application/CI sync; implement real sync if D1 is CMDB, else stub | FR-1, PRD §8 | ITDR does not become a general CMDB |
| C3 Dependency graph | Directed edges for recovery order; owner, environment, criticality | FR-2 | Graph can be shown and used as plan prerequisites |
| C4 Recovery strategy | Per target or tier: hot / warm / cloud DR / backup-restore | FR-5 | Strategy is required before submit-for-approval |
| C5 Owners | Primary + backup Plan Owner | FR-6, FR-13 | Assignment notifies Plan Owner |

### 5.4 Workstream D — Runbook builder and lifecycle

| Task | Detail | FRs | Done when |
|---|---|---|---|
| D1 Templates | Templates by recovery tier (1/2/3) | FR-7 | New plan can be created from a template |
| D2 Structured steps | Ordered procedures, prerequisites, rollback | FR-8 | Plan is not free-text-only |
| D3 Attachments | Diagrams, config backups, vendor SLAs as **supplements** | FR-9 | Attachments are not the system of record |
| D4 Contacts | Recovery team + escalation | FR-10 | Stored on the version |
| D5 Version states | `draft` → `in_review` → `approved` / returned; `superseded`; `retired` | FR-11, FR-12 | Only one current `approved` version per target |
| D6 Approval workflow | Submit, review comments, approve/reject; new edits after publish create a new draft and re-enter workflow | FR-11, FR-21 | Approval tuple: who, when, version ID |
| D7 Immutability | Approved versions are immutable | FR-12 | Changes clone to a new draft |
| D8 Assignment ack | Notification + acknowledgment when a plan is assigned | FR-13 | Ack is recorded |
| D9 Stale plan (review window) | Flag when approved version exceeds policy review window (D4) | FR-19 | Status becomes `expired` even without tests |
| D10 Crisis-compatible payload | Stable plan ID, version, owner, title, process/asset links matching BCP structure, ordered steps, roles | FR-2, §7.5 min | Crisis team can inspect records without a new API if mechanism is generic |

### 5.5 Workstream E — Partial readiness (engine only + coverage view)

Implement the readiness **policy service** now so Phase 2 only adds inputs.

| Dimension in Phase 1 | Source |
|---|---|
| Coverage | BIA target has a DR plan |
| Approval | Current version `approved` with evidence |
| Currency | Not past review window |
| Alignment | Claimed RTO/RPO meets live BIA (after override rules); else `bia_drift` |
| Test | **Not evaluated yet** (treat as unknown, not as pass) |

Composite statuses in Phase 1: `not_started`, `in_progress`, `approved_untested` (or `approved` until tests exist), `expired`, `bia_drift`. Do **not** show `ready` until Phase 2 can evaluate tests — that avoids false "ready" claims (context.md problem 4).

**Phase 1 UI:** coverage list (BIA apps vs plan status vs version), plan workspace, approval inbox, target drill-down (status + version history). Not the full FR-27 dashboard.

### 5.6 Phase 1 exit criteria

- BIA-scoped applications appear as recovery targets with inherited RTO/RPO.
- Plan Owner can author, attach evidence, submit; Approver can publish; versions and audit trail exist.
- Overrides, owners, strategy, dependency graph, and BCP link work.
- Published plans snapshot BIA data; subsequent BIA changes flag drift.
- Plan-to-process/asset linkage matches BCP's structure.
- No Crisis invocation UI, no Testing scheduler, no user-set ready flag.
- Tier 1/2 coverage % can be reported from live data.

---

## 6. Phase 2 — Testing integration and operational dashboard

**Outcome:** A published or due plan produces a DR Test in Testing; results update ITDR readiness automatically. Executives see coverage, test currency, and gaps. "Successful test" is always bound to a plan version.

**Success metrics touched:** % of DR plans tested within policy window; % of tested plans meeting target RTO/RPO; time to produce an operational readiness view (on-demand).

### 6.1 Workstream F — Testing contract

| Task | Detail | FRs | Done when |
|---|---|---|---|
| F1 Register `DR Test` | Distinct type alongside BCP Test | FR-14 | Testing UI/API lists DR Test |
| F2 Bind plan version | Every DR Test carries `planVersionId`, target, owner | architecture §4.5 | Unbound tests **do not** affect readiness |
| F3 Create-on-publish | Publishing an approved version requests a DR Test record in Testing | FR-15 | Testing remains scheduler of record |
| F4 Create-on-due | Recertification clock (D4) requests the next DR Test | FR-15, FR-19 | No second scheduler in ITDR |
| F5 DR fields | Target RTO/RPO, actual RTO/RPO, exercise mode (tabletop / simulation / full failover), step pass/fail | FR-16 | Fields live on the Testing record; ITDR reads them |
| F6 Result ingest | Pass/fail/partial, date, tester, evidence, version tested | FR-17 | Ingest is idempotent; Testing does not store "DR ready" |
| F7 Remediation flag | Failed test or actual RTO/RPO worse than target → plan flagged; typically requires update + re-approval (FR-21) | FR-18 | Status `failed_test`; dashboard lists open remediations |
| F8 Recertification reminders | Notify Plan Owners before window elapses | FR-20 | Uses BCM notification bus |
| F9 Test history UI | Read-only on the plan: tests for this and prior versions | FR-28 | Drill-down from dashboard |

### 6.2 Workstream G — Full readiness and dashboard

Extend the Phase 1 policy:

| Dimension | Ready when |
|---|---|
| Test | Latest **in-cycle** DR Test against the **current approved version** passed **and** actual RTO/RPO meets target (FR-16/18) |

`ready` is now a valid composite. Recalculate on: approve/supersede/retire, test ingest, BIA change, window elapsed (architecture §7.3).

| Task | Detail | FRs |
|---|---|---|
| G1 Dashboard | % with current plans, % tested in window, open gaps/remediation, counts by status, overdue recertifications, BIA drift | FR-27 |
| G2 Drill-down | Application/process → plan status, version history, test history | FR-28 |
| G3 Metric wiring | Tier 1/2 coverage; test-within-window; tested-plans-meeting-RTO/RPO | PRD §4 |

### 6.3 Phase 2 exit criteria

- Publishing or becoming due creates a DR Test in Testing without ITDR owning the calendar UI.
- Results update ITDR automatically; failed/unmet RTO flags remediation.
- Dashboard numbers drill to plan version + approval + test record.
- `ready` never appears without a passing in-cycle test of the current approved version.
- Time-from-incident-to-invocation is **not** measured yet (Crisis deferred).

---

## 7. Phase 3 — Compliance reporting and advanced inventory

**Outcome:** Auditors export evidence mapped to ISO 22301 and ISO/IEC 27031. Gaps are explicit. CMDB/ITSM sync is production-grade if D1 requires it.

### 7.1 Workstream H — Audit pack and standards mapping

| Task | Detail | FRs |
|---|---|---|
| H1 Evidence pack | For target + date range: versions, approver/when, which version was current, bound tests, inherited vs claimed RTO/RPO, drift events | FR-29, architecture §7.2 |
| H2 ISO 22301 map | Trace clauses to evidence types (plan currency, roles, exercise records, continual improvement via failed-test remediation) | FR-29, PRD §12 |
| H3 ISO/IEC 27031 map | ICT readiness: recovery strategy, dependencies, test modes, capability vs RTO/RPO | FR-29 |
| H4 Export | On-demand (PDF/CSV or platform equivalent); no manual compilation | PRD §4 |
| H5 Gap analysis | BIA apps with no plan, untested, expired, failed, drift, owner missing, strategy missing | FR-27 depth |

NIST SP 800-34 is a reference, not a separate report unless compliance asks for it.

### 7.2 Workstream I — Advanced CMDB / ITSM

| Task | Detail | FRs |
|---|---|---|
| I1 Production sync | Scheduled/event sync of applications and CI relationships | FR-1 |
| I2 Reconciliation | CMDB changes vs ITDR graph; do not overwrite approved plan snapshots | architecture ownership |
| I3 Scope discipline | Only CIs needed for DR planning; no general asset lifecycle | PRD §5 |

### 7.3 Phase 3 exit criteria

- Auditor produces a standards-mapped pack on demand.
- Gap list is actionable (owner, target, failing dimension).
- CMDB path is live **or** explicitly waived if D1 stays native.

---

## 8. Future — Crisis Management (not scheduled)

Do not start until D6 is answered with the team that built the BCP–Crisis link.

| If D6 is… | Work |
|---|---|
| Generic (any linked plan) | Register DR plans as invocable subjects; verify lookup; no new ITDR incident UI |
| BCP-hardcoded | Scoped extension **with the Crisis team**; still no forked invoke path in ITDR |

Then, and only then, schedule FR-22–26: query by affected systems, invoke from Crisis UI, Crisis notification channel, live step checkoff, post-mortem actual vs target RTO. PRD success metric "time from incident declaration to DR plan invocation" belongs here.

---

## 9. Suggested implementation order (inside each phase)

Build **domain and adapters before UI**. Vertical slices after the first entities exist.

**Phase 1 sequence**

1. A1–A3 (shell, RBAC, audit)
2. B1–B3 (target + BIA read)
3. C1, C3–C5 (assets, graph, strategy, owners) — C2 adapter stub in parallel
4. D1–D8 (builder + workflow)
5. B4, B6–B8 (override, BCP link, snapshot, drift)
6. E (readiness engine + coverage view)
7. D9–D10, A4 (stale review window, Crisis shape, notifications)

**Phase 2 sequence**

1. F1–F2 (type + binding) with Testing team
2. F3–F6 (create + ingest)
3. G1 readiness extension
4. F7–F9, G2–G3, F8 (remediation, dashboard, reminders)

**Phase 3 sequence**

1. H1–H4 (pack + maps + export)
2. H5 (gap analysis)
3. I1–I3 (CMDB) if still in scope

---

## 10. Team dependencies

| Team | When | Need from them |
|---|---|---|
| BIA | Sprint 0 + Phase 1 | Application ID, mapping and RTO/RPO API/events, change notifications |
| BCP | Sprint 0 + Phase 1 | Plan-to-process/asset linkage shape; plan ID for read-only reference |
| Testing | Sprint 0 contract; Phase 2 build | New test type, custom fields, create-record API, result events |
| Crisis Management | Sprint 0 assessment only | Whether invocation is generic; field list for lookup |
| CMDB/ITSM | Sprint 0 D1; Phase 1 stub; Phase 3 sync | Authoritative CI feed |
| BCM platform | All phases | Auth, RBAC, audit, notifications, tenancy, module packaging |
| InfoSec / BCM policy | Sprint 0 D4, D5 | Recertification windows, approval chain, SoD |

ITDR team does **not** wait on Crisis engineering for Phases 1–3 beyond the Sprint 0 field list.

---

## 11. Test strategy (for the ITDR build itself)

| Layer | What to prove |
|---|---|
| Domain | Version state machine; one current approved version; snapshot immutability; readiness truth table (including "no test ⇒ not ready") |
| BIA adapter | Inherit, roll-up, drift on change, override does not write to BIA |
| Testing adapter | Bind by `planVersionId`; unbound result ignored; ingest idempotent; fail ⇒ `failed_test` |
| Auth | Role matrix for FR-30; SoD on approve |
| Audit | Approval and override events are append-only |
| UI | Coverage, plan authoring, approval, dashboard drill-down to evidence |
| Regression | BCP, BIA, Crisis, Testing existing flows unchanged |

Cannot fully browser-verify Crisis invocation until Future. Phase 1 should verify Crisis-compatible fields exist on approved plans (contract test against the BCP linkage shape).

---

## 12. Risks and how the plan absorbs them

| Risk | Mitigation |
|---|---|
| Testing module cannot grow a new type/fields | Sprint 0 spike; if blocked, Phase 2 slips — do not fake tests inside ITDR |
| BIA IDs unstable or RTO stored only on processes | D2 default roll-up; surface unmapped apps as BIA gaps |
| CMDB not identified | Native inventory + adapter; Phase 3 sync optional |
| Approval chain undecided | Single step now, multi-step-capable workflow |
| Team treats Crisis as Phase 1 scope | Explicit non-goal; D10 is data shape only |
| Dashboard shows Ready before tests exist | Phase 1 omits `ready`; Phase 2 introduces it |
| Duplicate RTO in ITDR | Inherited field + optional override with log; BIA remains SoR |
| Runbooks become attachment dumps | Structured steps required to submit |

---

## 13. FR traceability

| FRs | Phase | Notes |
|---|---|---|
| FR-1 | 1 (native/adapter), 3 (advanced sync) | D1 |
| FR-2, FR-3, FR-4, FR-5, FR-6 | 1 | |
| FR-7–13, FR-21 | 1 | |
| FR-19 | 1 (review window), 2 (test window) | |
| FR-30 | 1 (enforce), all phases (extend) | |
| FR-14–18, FR-20 | 2 | |
| FR-27, FR-28 | 2 (FR-27 coverage stub in Phase 1 list) | |
| FR-29 | 3 | |
| FR-22–26 | Future | After D6 |

---

## 14. Definition of done (product, not just tickets)

A phase is done when:

1. Exit criteria in this plan are met in the BCM application (not only in design docs).
2. Readiness numbers on any screen are explainable by plan version, approval, BIA snapshot/drift, and (from Phase 2) bound test records.
3. No new system of record was created for BIA, BCP, Crisis, or Testing data.
4. Open questions that were gated for that phase are either decided or explicitly deferred with a default that is implemented.

When Phase 2 is done, context.md's five problems should be closed **except** live incident invocation (problem 1 is reduced via accessible, current, tested runbooks; invocation speed remains a Future metric).
