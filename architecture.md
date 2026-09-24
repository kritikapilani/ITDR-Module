# ITDR Module — Architecture

This document defines how the IT Disaster Recovery (ITDR) module sits inside the existing BCM application, what it owns, what it consumes, and how readiness, testing, and audit evidence are produced. It is derived from `context.md` and does not invent a parallel BCM stack.

## 1. Architectural intent

ITDR is a **bounded module inside the BCM application**, not a standalone DR product.

- It is the system of record for **technical recovery plans**, **asset/dependency data**, **plan versioning/ownership/approval**, and **derived DR readiness**.
- It is a **consumer** of BIA (RTO/RPO, process-to-application mapping) and Testing (DR Test type, schedule, results).
- It is **linkage-compatible** with Crisis Management's existing plan-invocation mechanism, but Crisis invocation is **not a Phase 1 integration**.
- It does **not** own business continuity plans (BCP), incident/crisis workflow (Crisis Management), BIA master data, or the test scheduling/execution engine.

Design principle: **integrate, do not replace**. Duplicate data entry is an explicit anti-goal.

## 2. Placement in BCM

```
┌─────────────────────────────────────────────────────────────────┐
│                        BCM Application                          │
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   BIA   │  │   BCP   │  │   Crisis     │  │   Testing    │   │
│  │ (SoR)   │  │ (SoR)   │  │  Management  │  │   (SoR)      │   │
│  └────┬────┘  └─────────┘  │  (SoR)       │  └──────┬───────┘   │
│       │                    └──────┬───────┘         │           │
│       │ read mapping,             │ deferred        │ DR Test   │
│       │ RTO/RPO                   │ invocation      │ type +    │
│       ▼                           │ compatibility   │ results   │
│  ┌────────────────────────────────┴─────────────────┴─────────┐ │
│  │                      ITDR module                           │ │
│  │  plans · assets/deps · versions · approvals · readiness    │ │
│  │  dashboard · audit reporting                               │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

ITDR shares the BCM application's identity, tenancy, authorization, and audit infrastructure. It does not introduce a separate identity or reporting plane.

## 3. Bounded contexts and data ownership

| Domain | System of record | ITDR relationship |
|---|---|---|
| Process criticality, RTO/RPO, process-to-application mapping | BIA | Read / inherit; never re-key |
| Business-side continuity plan | BCP | No write; optional read-only context later |
| Incident/crisis workflow and plan invocation | Crisis Management | Data-shape compatibility now; invocation later if extensible |
| Test types, scheduling, execution, results | Testing | Register DR Test type; consume results |
| Technical recovery plan (runbook) | **ITDR** | Create, version, approve |
| Application / infrastructure assets and technical dependencies | **ITDR** | Own the technical graph; bind to BIA applications |
| Plan ownership, approval workflow, version history | **ITDR** | First-class |
| DR readiness status | **ITDR (derived)** | Not a user-editable field |
| Coverage, currency, test-history reporting | **ITDR** | Reads own records + Testing results + BIA objectives |

### Ownership rules

1. BIA remains authoritative for *what the business expects* (RTO/RPO, which processes depend on which applications).
2. ITDR is authoritative for *how IT recovers those applications* and *whether that recovery capability is current, approved, and tested*.
3. Testing remains authoritative for *whether a test ran, when, against which plan version, and what the outcome was*.
4. Crisis Management remains authoritative for *invoking a plan during an incident*. ITDR only ensures the plan record can be linked later.

## 4. Core domain model

Logical entities. Physical schema is an implementation choice; names below are the conceptual contract.

### 4.1 Recovery target

A **Recovery Target** is the technical subject of a DR plan: an application or infrastructure component that BIA has already mapped to one or more business processes.

- Bound to a BIA application (or equivalent BIA identifier). Inherited fields: process links, RTO, RPO, criticality.
- ITDR-owned fields: technical owner, asset inventory, dependency graph, recovery tier/strategy, plan association.
- One recovery target has **at most one current approved plan**, and zero or more historical versions.

ITDR must not create a shadow catalogue of business processes. If a process-to-application mapping is missing, that is a BIA gap surfaced by ITDR, not data ITDR fills in.

### 4.2 Asset and dependency graph

ITDR owns the **technical** graph needed to recover a target:

- Assets: applications, infrastructure components, data stores, network/identity dependencies, third-party services as they affect recovery.
- Dependencies: directed relationships used to order recovery (e.g. identity before app, database before app).
- Each node/edge has owner, environment (prod/DR), and criticality relative to the target.

This graph is distinct from BIA's process-to-application map. BIA answers *which business processes need this app*. ITDR answers *what must come up, in what order, to recover this app*.

### 4.3 DR plan (runbook)

A **DR Plan** is a versioned, approvable document-plus-structure for one recovery target (or a tightly coupled target group, if the implementation later allows grouping — default is one plan per target).

Minimum structured content:

- Identity: target, owner, approver role, classification
- Inherited objectives: RTO, RPO, related processes (from BIA, snapshot at version publish)
- Recovery strategy (e.g. failover, restore, rebuild) and declared recovery capability (RTO/RPO the plan claims it can meet)
- Ordered recovery steps / runbook sections
- Roles and contacts for execution
- Dependencies and prerequisites drawn from the asset graph
- Evidence attachments (architecture, network, backup references) as supporting artifacts, not as the plan itself

Unstructured attachments are allowed as supplements. The plan itself must be structured enough to:

- version and approve
- bind to a DR Test
- compute readiness
- remain linkage-compatible with Crisis Management invocation later

### 4.4 Plan version and approval

Every meaningful change produces a **Plan Version**.

| State | Meaning |
|---|---|
| `draft` | Editable; not evidence of readiness |
| `in_review` | Submitted; locked except for review comments / requested changes |
| `approved` | Current (or historical) approved version; immutable except via a new version |
| `superseded` | Previously approved; retained for audit |
| `retired` | Target no longer in scope or plan withdrawn |

Rules:

- Only one `approved` version is current per target.
- Approval records **who**, **when**, and **which version**. That tuple is audit evidence.
- Publishing an approved version **snapshots** inherited BIA RTO/RPO and mapping, so later BIA changes do not silently rewrite historical evidence. Drift between snapshot and live BIA is a readiness/reporting signal.
- Ownership is explicit on every version (plan owner, technical owner, approver).

### 4.5 DR Test binding

ITDR does not schedule or execute tests. It **declares** that a plan version requires a DR Test on a cycle, and **consumes** Testing-module results.

Binding contract:

- Test type: `DR Test` (distinct from BCP / crisis exercises already in Testing)
- Subject: DR Plan Version ID (not just the application name)
- Cycle / next-due: stored in ITDR or requested of Testing; source of scheduling truth is Testing
- Result fields consumed: outcome, date, tester, plan version tested, evidence/notes reference

A test that cannot be tied to a specific plan version **does not** count toward readiness.

### 4.6 Readiness (derived)

**Readiness is not a stored opinion.** It is computed from plan + approval + test + BIA alignment.

Suggested dimensions (dashboard can roll these up):

| Dimension | Ready when |
|---|---|
| Coverage | Target in BIA scope has an associated DR plan |
| Currency | Current version is `approved` and not past review/recertification window |
| Approval | Current version has a recorded approver and timestamp |
| Test | Latest in-cycle DR Test against the **current approved version** passed |
| Alignment | Plan's claimed capability meets (or is not worse than) live BIA RTO/RPO; snapshot drift is flagged |

Composite statuses (illustrative): `not_started`, `in_progress`, `approved_untested`, `ready`, `expired`, `failed_test`, `bia_drift`. Exact labels can be refined in product design; the architecture constraint is that users cannot set "ready" by hand.

## 5. Integration architecture

Integrations are **module contracts inside BCM**, preferably via internal APIs or shared domain events — not file drops or parallel spreadsheets.

### 5.1 BIA → ITDR (required, Phase 1)

Direction: BIA is upstream.

ITDR reads:

- Applications / systems in BIA scope
- Process-to-application mapping
- RTO, RPO, criticality per process (and the most demanding values rolled up to the application)

ITDR writes: nothing to BIA.

Behaviors:

- Target list for DR planning is **seeded from BIA applications**, not typed from scratch.
- Inherited objectives are displayed on the plan and snapshotted at approval.
- If BIA mapping or RTO/RPO changes, ITDR marks **drift**; it does not auto-edit the approved plan.

### 5.2 ITDR ↔ Testing (required, Phase 1)

Direction: bidirectional, split by ownership.

ITDR provides:

- Registration of test type `DR Test`
- Plan Version ID, target, owner, recertification cycle
- Request / eligibility for a test against a given version

Testing provides:

- Schedule and execution
- Result (pass/fail/partial, date, evidence, which Plan Version ID was tested)

ITDR then recomputes readiness. Testing must not store a competing "DR ready" flag.

### 5.3 ITDR → Crisis Management (deferred)

Phase 1 obligation: **shape the DR plan record so it can be invoked later** the way BCP plans are invoked today.

Until the Crisis team confirms extensibility:

- Do not build a second invocation UI or incident workflow in ITDR.
- Do give each approved plan a stable ID, version, owner, title, and invocation-safe payload (steps, roles, target).
- Treat invocation as an open integration, not a gap in ITDR's own scope.

If the existing mechanism can already attach to a new plan type, Phase 2 is configuration. If it is hard-wired to BCP, Phase 2 is an extension owned with the Crisis team — still not a rewrite of Crisis workflow inside ITDR.

### 5.4 ITDR and BCP

No integration required for core ITDR. Optional later: show related BCP plan IDs on a recovery target for operator context. BCP remains the business-side plan; ITDR remains the technical runbook.

## 6. Application architecture (logical)

Inside the BCM app, ITDR is a vertical slice:

```
┌──────────────────────────────────────────┐
│ Presentation                             │
│  Plan workspace · approval · dashboard   │
│  audit reports · coverage views          │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│ Application services                     │
│  Plan lifecycle · versioning · approval  │
│  Readiness calculation · BIA sync/drift  │
│  Test-result ingestion · reporting       │
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│ Domain                                   │
│  RecoveryTarget · AssetGraph · DrPlan    │
│  PlanVersion · Approval · ReadinessPolicy│
└──────────────────┬───────────────────────┘
                   │
┌──────────────────▼───────────────────────┐
│ Persistence + audit log                  │
│  ITDR tables · immutable version store   │
│  approval/test evidence · change history │
└──────────────────────────────────────────┘
          │                    │
          ▼                    ▼
   BIA read adapter     Testing adapter
   (mapping, RTO/RPO)   (DR Test + results)
```

Cross-cutting (use BCM platform, do not rebuild):

- Authentication / RBAC
- Tenant and organizational scoping
- Notification (review requested, test due, approval complete, drift)
- Immutable audit trail of who changed what

### Suggested capabilities in the UI (not a screen inventory)

- Coverage: BIA applications vs. plans vs. readiness
- Plan workspace: structured runbook editor, dependencies, inherited objectives
- Approval inbox / workflow
- Test history for a plan version (read-only from Testing)
- Readiness dashboard
- Audit report: coverage, currency, approval evidence, test evidence, BIA alignment

## 7. Readiness and reporting architecture

Reporting is a **read model** over ITDR + Testing + BIA, designed for ISO 22301 / ISO/IEC 27031 evidence — not a separate spreadsheet.

### 7.1 Dashboard (operational)

At any time, for a scope (org, process area, application set):

- % of BIA applications with a plan
- % with current approved version
- % with in-cycle passed DR Test against current version
- Counts by composite readiness status
- Overdue recertifications and failed tests
- BIA drift (live RTO/RPO tighter than snapshotted / claimed capability)

### 7.2 Audit pack (evidential)

For a given target and time range, exportable evidence:

- Plan versions and who approved them, when
- Which version was current on a given date
- DR Tests bound to those versions, outcomes, dates
- Inherited vs. claimed RTO/RPO at each approval
- Subsequent BIA changes that created drift

This pack is how "successful test" and "we have a DR plan" become substantiated claims.

### 7.3 Recalculation

Readiness is recalculated when:

- a plan version is approved, superseded, or retired
- a DR Test result is ingested
- BIA mapping or RTO/RPO changes for a linked application
- a recertification window elapses (time-based job)

Do not cache "ready" as a user-toggled field. A materialized status column is acceptable if it is always recomputed from sources.

## 8. Security, access, and audit

- **RBAC** at least: DR planner (edit drafts), plan owner, approver (cannot approve own draft if policy requires segregation), auditor (read + export), admin.
- **Approvals and test results are append-only evidence.** Corrections create new versions or new test records.
- **Need-to-know:** runbooks may contain recovery credentials *references* and architecture detail; store secrets in the organization's secret system, not in the runbook body.
- **Traceability:** every readiness claim on the dashboard must drill to the underlying plan version, approval, and test record.

## 9. Delivery phasing

### Phase 1 — close the planning and evidence gap

- BIA inheritance (targets, mapping, RTO/RPO) and drift detection
- Asset/dependency data for recovery targets
- Structured, versioned, approvable DR runbooks
- DR Test type in Testing; results → readiness
- Derived readiness + coverage dashboard + audit-ready reports

Out of Phase 1: Crisis invocation, BCP deep linking, any replacement of Testing's scheduler.

### Phase 2 — invocation (conditional)

- Confirm with the Crisis Management team whether the existing BCP invocation mechanism accepts a new plan type.
- If yes: register DR plans as invocable subjects.
- If no: extend that mechanism with the Crisis team; do not fork an ITDR-only invoke path.

## 10. Open items that constrain architecture

These must be resolved with owning teams; they are not ITDR product guesses:

1. **Crisis invocation extensibility** — can DR plans use the existing BCP invocation link without new work?
2. **BIA identity of an "application"** — stable ID, grain (application vs. system vs. service), and how RTO/RPO roll up when multiple processes share an app.
3. **Testing contract** — how a new test type is registered, how a test is bound to an external plan version ID, and the canonical result schema.
4. **Grouping** — one plan per application vs. shared plans for tightly coupled infrastructure; default is one plan per BIA application.
5. **Recertification clock** — calendar cycle vs. triggered by material change (BIA RTO tightening, major architecture change). Architecture supports both; policy chooses.

## 11. Non-goals

- Replacing BCP, Crisis Management, BIA, or Testing
- Free-text-only runbooks as the system of record
- User-set "ready" flags
- Re-entering RTO/RPO or process mapping in ITDR
- Building a new incident command UI in ITDR
- Treating Crisis invocation as a confirmed Phase 1 gap
