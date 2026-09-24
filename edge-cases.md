# ITDR Module — Edge Cases

Expected behavior for non-happy-path situations. Grounded in `PRD`, `architecture.md`, `context.md`, and `implementation-plan.md`.

**How to read this file**

- **Must** = product/architecture rule. Implement and test in the named phase.
- **Default** = Sprint 0 decision still open; use the implementation-plan default until BCM policy overrides it.
- Readiness is **always derived**. No case may be resolved by letting a user set `ready`.

Composite statuses used below: `not_started`, `in_progress`, `approved_untested`, `ready` (Phase 2+ only), `expired`, `failed_test`, `bia_drift`.

---

## 1. BIA inheritance, mapping, and RTO/RPO

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-BIA-01 | BIA application has no process mapping | Target still appears in coverage as a **BIA gap**. ITDR does not let users create processes. Inherited RTO/RPO may be empty; submit-for-approval requires a defined objective (inherited or justified override). | FR-2, FR-3 · P1 |
| EC-BIA-02 | Application mapped to several processes with different RTOs/RPOs | Inherit the **most demanding** values (lowest RTO and lowest RPO) unless D2 says otherwise. Show contributing processes on the target. | FR-3, D2 · P1 |
| EC-BIA-03 | One process with no RTO or RPO among several | Roll-up ignores nulls if any sibling has a value; if **all** are null, treat as missing inheritance (EC-BIA-01). | FR-3 · P1 |
| EC-BIA-04 | BIA application ID reused after delete-and-recreate | Recovery target is keyed to the **stable BIA ID**. If BIA reuses IDs, Sprint 0 must reject that contract. Until then, do not merge history across a broken identity. | D2 · P1 |
| EC-BIA-05 | Application removed from BIA scope | Target is not deleted. Mark **out of BIA scope**. Current approved plan may be `retired` by an Admin/DR Coordinator, not auto-wiped. Coverage % denominator is **current BIA scope** only. Historical versions remain for audit. | FR-2 · P1 |
| EC-BIA-06 | Application added to BIA after ITDR go-live | Appears as `not_started` on the next BIA sync. No plan auto-created. | FR-3 · P1 |
| EC-BIA-07 | Live BIA RTO tightens after a plan was approved | Do **not** rewrite the approved version. Snapshot stays. Flag `bia_drift`. Recalculate readiness. Plan body unchanged until a new version is authored. | architecture §4.4 · P1 |
| EC-BIA-08 | Live BIA RTO loosens (less demanding) after approval | Still flag drift (snapshot ≠ live). Drift is informational; claimed capability still meets live BIA so alignment dimension can pass. Dashboard should distinguish **tightening** (risk) vs **loosening** (informational). | architecture §4.6 · P1 |
| EC-BIA-09 | Process unmapped from the application in BIA | Snapshot on approved version keeps the old mapping. Live view updates. Drift if mapped processes changed. | FR-2 · P1 |
| EC-BIA-10 | User tries to type RTO/RPO as if ITDR were the source | Inherited fields are read-only. Only FR-4 override path is allowed, with mandatory justification. Override **never writes back to BIA**. | FR-3, FR-4 · P1 |
| EC-BIA-11 | Override makes application RTO **weaker** than inherited BIA (longer RTO / larger RPO) | Allowed only with justification. Alignment dimension fails (`bia_drift` or explicit override-risk). Cannot become `ready` in Phase 2 while claimed/override capability is worse than live BIA. | FR-4 · P1–2 |
| EC-BIA-12 | Override makes RTO **tighter** than BIA | Allowed with justification. Alignment can pass. Snapshot at approval stores both inherited and override. | FR-4 · P1 |
| EC-BIA-13 | Override without justification | Reject. No save. | FR-4 · P1 |
| EC-BIA-14 | BIA temporarily unavailable | Last successful read is shown as **stale inheritance** with timestamp. Do not invent values. Approvals may proceed only if a snapshot can still be taken from last-known values **and** the UI warns; prefer blocking approval if BIA has never been read. | FR-3 · P1 |
| EC-BIA-15 | BIA change event arrives twice | Drift detection is idempotent. One drift flag, one audit row for the same before/after. | P1 |
| EC-BIA-16 | Claimed recovery capability on the plan differs from inherited (and from override) | Claimed capability is an ITDR field. Alignment compares **claimed** (and override if it is the planning target) to **live BIA**. Mismatch is `bia_drift` even if the plan is approved. | architecture §4.3 · P1 |

---

## 2. Recovery targets, coverage, and grain

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-TGT-01 | User tries to create a target with no BIA application ID | Reject. Targets are seeded from BIA, not typed as a parallel catalogue. | FR-1, FR-2 · P1 |
| EC-TGT-02 | Two plans for one BIA application | Reject. **At most one current approved plan** per target. A new draft is allowed **beside** the current approved version; publishing it supersedes. | architecture §4.1 · P1 |
| EC-TGT-03 | Request to share one plan across tightly coupled apps | Out of default grain. Do not implement grouping in Phase 1. Workaround: duplicate runbook content per target, or wait for an approved grouping decision. | architecture §10.4 · P1 |
| EC-TGT-04 | Tier 3 (or un-tiered) applications in BIA | Included in the catalogue. Success metric **% of Tier 1/2** excludes them from the numerator/denominator of that KPI; they still appear on coverage lists with a filter. | PRD §4 · P1 |
| EC-TGT-05 | Application in BIA with no criticality/tier | Treat as un-tiered (EC-TGT-04). Template picker still works (generic or Admin-assigned default). | FR-7 · P1 |
| EC-TGT-06 | Duplicate CMDB CI names, distinct BIA IDs | Two targets. Identity is BIA ID, not display name. | D1, D2 · P1 |
| EC-TGT-07 | Coverage % with zero BIA applications in scope | Show empty state, not 100% and not divide-by-zero. | FR-27 · P1–2 |

---

## 3. Assets, dependencies, and CMDB

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-AST-01 | Dependency cycle (A→B→A) | Save is rejected or saved with a **cycle error** that blocks submit-for-approval. Recovery order cannot be derived. | FR-2 · P1 |
| EC-AST-02 | Shared dependency (identity provider used by many targets) | Same CI may appear on multiple graphs. Editing shared CI metadata does not rewrite other targets' **approved plan snapshots**. | FR-1 · P1 |
| EC-AST-03 | Asset deleted while referenced by an approved plan | Approved version snapshot retains the dependency list. Live graph shows the asset as removed/missing. Drift or graph-gap flag; plan not auto-edited. | FR-12 · P1 |
| EC-AST-04 | User tries to run general CMDB lifecycle (procure, retire fleet-wide) in ITDR | Out of scope. ITDR only references CIs needed for DR. Point users at CMDB/ITSM. | PRD §5 · P1 |
| EC-AST-05 | CMDB sync updates a CI that diverges from native ITDR edits | Adapter wins on **CMDB-sourced fields** if D1 = CMDB; native annotations (DR-specific criticality, recovery notes) are preserved. Never overwrite an approved plan snapshot. | FR-1 · P3 |
| EC-AST-06 | CMDB sync is down or partial | Last successful sync timestamp shown. Planning continues on native/cached CIs. Do not delete assets because a sync failed. | FR-1 · P1/P3 |
| EC-AST-07 | CMDB returns an application not in BIA | Do **not** create a recovery target. Optionally list as "CI without BIA application" for Admin — it is not in coverage denominator. | FR-1, FR-2 · P3 |
| EC-AST-08 | Empty dependency graph | Allowed for draft. Submit-for-approval: warn; Admin policy may require at least one node (the app itself). Default: require the target application as a node. | FR-2 · P1 |
| EC-AST-09 | Recovery strategy missing | Block submit-for-approval. | FR-5 · P1 |

---

## 4. Plan authoring, templates, and attachments

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-PLN-01 | Submit with no structured steps (attachments only) | Reject. Attachments are supplements, not the system of record. | FR-8, FR-9 · P1 |
| EC-PLN-02 | Steps with no rollback section | Warn; default **allow** submit (rollback may be N/A). Do not silently invent rollback steps. | FR-8 · P1 |
| EC-PLN-03 | Template applied to an existing draft with content | Confirm overwrite vs merge. Never apply a template to an `approved` version in place. | FR-7 · P1 |
| EC-PLN-04 | Tier changes after a template was applied | Draft may keep old structure. Prompt Plan Owner to re-apply the matching template. Approved versions unchanged. | FR-7 · P1 |
| EC-PLN-05 | Attachment malware / disallowed type | Use BCM upload policy. Reject; plan remains. | FR-9 · P1 |
| EC-PLN-06 | Attachment removed after approval | Approved version's attachment references stay in the snapshot/store. Removal only affects a new draft. | FR-12 · P1 |
| EC-PLN-07 | Recovery contacts empty | Block submit-for-approval. | FR-10 · P1 |
| EC-PLN-08 | Contact is a user who left the org | Flag stale contact on live plan view. Do not rewrite approved snapshots. Block new approval until contacts are valid. | FR-10 · P1 |
| EC-PLN-09 | Runbook contains passwords / secrets in step text | Warn on submit (pattern/heuristic). Architecture rule: store **references**, not secrets. Do not block solely on heuristics unless InfoSec policy says so; never display a "secret vault" inside ITDR. | architecture §8 · P1 |
| EC-PLN-10 | Very large runbook (hundreds of steps) | Must still version, approve, and bind tests. UI should paginate; no silent truncation. | FR-8 · P1 |
| EC-PLN-11 | Concurrent edits to the same draft | Last-write-wins is unacceptable for runbooks. Use optimistic concurrency (version token). Second saver is told to reload. | FR-12 · P1 |
| EC-PLN-12 | Plan Owner pastes a full BCP document into the runbook | Allowed as text, but BCP remains linked by ID (not duplicated as SoR). No requirement to parse BCP content. | PRD §5, §8 · P1 |

---

## 5. Versioning, approval, and ownership

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-APR-01 | Author tries to approve their own plan | Reject when D5 SoD is on (default). Audit the attempt. | FR-11, FR-30, D5 · P1 |
| EC-APR-02 | Approver has both Approver and Plan Owner roles on this target | Still SoD: if they authored/submitted this version, they cannot approve it. | D5 · P1 |
| EC-APR-03 | Two approvers act at once | First successful approve wins. Second sees `approved` (or conflict). Only one current `approved` version. | FR-11 · P1 |
| EC-APR-04 | Approve while BIA drift already exists on an older snapshot | New approval **takes a fresh snapshot**. That may **clear** prior drift if live values are now snapshotted. Drift on the superseded version remains historical. | B7, B8 · P1 |
| EC-APR-05 | Reject / request changes | Version returns to `draft` (or equivalent editable state). Comments stored. Not evidence of readiness. | FR-11 · P1 |
| EC-APR-06 | Edit an `in_review` plan | Locked except review comments. Plan Owner must withdraw/recall (if permitted) to edit, which cancels review. | FR-11 · P1 |
| EC-APR-07 | Edit an `approved` plan | Forbidden in place. Creates a new `draft` version; current approved remains current until the new one is approved. | FR-12, FR-21 · P1 |
| EC-APR-08 | New version approved | Previous current becomes `superseded`. Immutable. Tests bound to the old version **do not** satisfy the new version's test dimension (Phase 2). | FR-12 · P1–2 |
| EC-APR-09 | Retire a plan | Target goes to `retired` / coverage `not_started` or `retired` excluded from "has current plan." History retained. Open DR Tests in Testing are not executed by ITDR; ITDR should signal cancel/obsolete to Testing if the contract allows, else they remain Testing's problem and **do not** count for a retired plan. | FR-12 · P1–2 |
| EC-APR-10 | No primary Plan Owner | Assignment required before submit. Backup-only is not enough. | FR-6 · P1 |
| EC-APR-11 | Primary and backup are the same person | Reject. | FR-6 · P1 |
| EC-APR-12 | Plan reassigned while `in_review` | New owner is notified (FR-13). Review stays with the submitted version unless Admin withdraws. Ack required from the new owner. | FR-13 · P1 |
| EC-APR-13 | Assignment notification undelivered | Record notification failure. Plan remains assigned. Retry via BCM bus. Ack can still be done in-app. | FR-13 · P1 |
| EC-APR-14 | Owner never acknowledges | Plan can still be drafted. Policy default: **ack is not a gate to submit**; it is tracked. Surface unacked assignments on Admin list. | FR-13 · P1 |
| EC-APR-15 | Multi-step approval (if D5 later requires it) | Intermediate signs are not `approved`. Only the final step publishes, snapshots BIA, and (Phase 2) triggers DR Test creation. | D5, FR-15 · P1–2 |
| EC-APR-16 | Clock skew: approve at 23:59 vs recertification window | Window calculations use BCM server time (UTC stored). Document timezone on reports. | FR-19 · P1 |
| EC-APR-17 | User sets status to `ready` in API/UI | Field is not writable. 409/403. | architecture §4.6 · P1 |
| EC-APR-18 | Draft deleted | Allowed if never approved. If any prior approved version exists, deleting "the plan" is retire, not erase. | FR-12 · P1 |
| EC-APR-19 | Re-publish without going through approval | Forbidden. FR-21: updates re-enter workflow. | FR-21 · P1 |

---

## 6. Testing integration (Phase 2)

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-TST-01 | Test result with no `planVersionId` | Ingest ignored for readiness. Do not guess the current plan. Log for Test Manager. | architecture §4.5 · P2 |
| EC-TST-02 | Test bound to a **superseded** version | History is shown on that version. Does **not** make the **current** version `ready`. | FR-17 · P2 |
| EC-TST-03 | Test bound to a version that was never approved | Does not count. | FR-17 · P2 |
| EC-TST-04 | Duplicate result events (retry) | Idempotent ingest on Testing result ID. Readiness calculated once. | FR-17 · P2 |
| EC-TST-05 | Out-of-order results (fail then pass, late fail) | Latest result **for that plan version** by Testing completion time wins. A later fail after a pass → `failed_test` and remediation. | FR-17, FR-18 · P2 |
| EC-TST-06 | Partial pass | Not `ready`. Treat as incomplete/fail for the test dimension unless policy later defines partial credit. Default: **not a pass**. | FR-16 · P2 |
| EC-TST-07 | Tabletop pass vs full-failover policy | Result may be `pass` in Testing. Readiness policy may require a minimum exercise mode by tier (Default: any registered DR Test pass counts until BCM policy says otherwise). Dashboard should still **show the mode**. | FR-16, D4 · P2 |
| EC-TST-08 | Actual RTO/RPO worse than target but Test Manager marked pass | ITDR flags unmet RTO/RPO (FR-18) **even if** Testing outcome is pass. Not `ready`. Remediation required. | FR-16, FR-18 · P2 |
| EC-TST-09 | Actual RTO/RPO missing on a "pass" | Test dimension does not pass. Prompt Testing to complete DR fields. | FR-16 · P2 |
| EC-TST-10 | Step pass/fail incomplete | Same as EC-TST-09 if FR-16 fields are required. Default: require step outcomes for full-failover; tabletop may record N/A. | FR-16 · P2 |
| EC-TST-11 | Publish approved version; Testing API fails to create DR Test | Plan remains `approved`. Outbox/retry the create request. Surface integration error. Do **not** roll back approval. Do **not** invent a test inside ITDR. | FR-15 · P2 |
| EC-TST-12 | Publish creates a test when an open DR Test already exists for this version | Do not create a duplicate. Reuse the open record. | FR-15 · P2 |
| EC-TST-13 | Recertification due while a test is already in progress | Do not create a second in-flight test. Remind only. | FR-15, FR-20 · P2 |
| EC-TST-14 | Recertification due and last test failed | Keep `failed_test`. Due clock still creates/requests a new test only if none is open (EC-TST-13). | FR-18 · P2 |
| EC-TST-15 | Plan published twice quickly (double approve race) | One current version, at most one create-test for that version (EC-TST-12). | FR-15 · P2 |
| EC-TST-16 | BCP Test (or other type) executed against the same application | Ignored by ITDR readiness. Only `DR Test` type counts. | FR-14 · P2 |
| EC-TST-17 | Test Manager schedules a DR Test from Testing without ITDR trigger | Allowed (Testing is scheduler of record). Counts if bound to `planVersionId` of the current approved version. | FR-14 · P2 |
| EC-TST-18 | Failed test; Plan Owner updates runbook but does not re-publish | Remains `failed_test`. Draft does not clear the flag. Only a new approved version (and a new bound test) can. | FR-18, FR-21 · P2 |
| EC-TST-19 | Failed test; new version approved, not yet retested | Status `approved_untested` (or equivalent), not `ready`, not still `failed_test` of the old version. Old fail remains on old version history. | FR-18 · P2 |
| EC-TST-20 | Test window elapsed; last test was pass on **current** version | Currency/test dimension fail → `expired`. Do not keep `ready`. | FR-19 · P2 |
| EC-TST-21 | Pass on current version, but review window (plan currency) elapsed independently of test window | `expired` if either window lapsed (D4 may use one policy object for both). | FR-19 · P1–2 |
| EC-TST-22 | ITDR must not show Testing's calendar as the place to reschedule | Deep-link to Testing if BCM supports it. No second scheduler. | PRD §5 · P2 |
| EC-TST-23 | Testing module stores a "DR ready" flag | ITDR ignores it. ITDR readiness is the only flag shown on the ITDR dashboard. | architecture §5.2 · P2 |
| EC-TST-24 | Step results for a version whose steps later changed in a draft | Results stay attached to the **tested version's** step IDs. Do not remap onto the draft. | FR-16 · P2 |

---

## 7. Readiness, dashboard, and stale flags

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-RDY-01 | Phase 1: approved, in-window, aligned, never tested | `approved_untested` (or `approved`). **Never** `ready`. | implementation-plan §5.5 · P1 |
| EC-RDY-02 | Multiple failing dimensions (expired + drift + failed test) | Composite status uses a **priority** (Default: `failed_test` > `expired` > `bia_drift` > `approved_untested` > `in_progress` > `not_started`). Dashboard still lists **all** open gaps. | FR-27 · P2 |
| EC-RDY-03 | User filters dashboard to "ready"; a record flips during the view | Counts are a point-in-time read model. Drill-down always recomputes or shows as-of timestamp. | FR-27, FR-28 · P2 |
| EC-RDY-04 | Executive sees 100% ready because Tier 3 is excluded inconsistently | KPI definitions: Tier 1/2 for PRD §4 metrics; dashboard must label the population. Do not mix unlabeled denominators. | PRD §4 · P2 |
| EC-RDY-05 | Drill-down by **process** that maps to many applications | Show each application's plan/test status. Process itself has no DR plan. | FR-28 · P2 |
| EC-RDY-06 | Drill-down by application with no plan | Empty plan/test history; CTA to assign owner / start plan. | FR-28 · P2 |
| EC-RDY-07 | Recertification reminder when owner mailbox is invalid | Same as EC-APR-13. Plan still flags stale. | FR-20 · P2 |
| EC-RDY-08 | Reminder spam (job runs every hour) | Reminders are policy-cadenced (e.g. 30/14/7/1 days). Not every recalc. | FR-20 · P2 |
| EC-RDY-09 | Window elapses on a weekend/holiday | Job still flags `expired`. No business-day delay unless policy adds one. | FR-19 · P1–2 |
| EC-RDY-10 | Material BIA change vs calendar recertification | Architecture supports both. Default D4 is calendar. A tightening RTO (EC-BIA-07) flags drift immediately **without** waiting for the calendar. | D4 · P1–2 |
| EC-RDY-11 | Materialized ready column out of date | Recalc triggers: approve/supersede/retire, test ingest, BIA change, window job. If a trigger was missed, a rebuild job must be able to recompute all. | architecture §7.3 · P2 |
| EC-RDY-12 | Dashboard tile cannot drill to evidence | Bug. Every % must open the list of contributing targets and then version/approval/test records. | architecture §8 · P2 |

---

## 8. BCP linkage

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-BCP-01 | No BCP plan for the process | DR plan still valid. BCP reference empty. Not an ITDR defect. | PRD §8 · P1 |
| EC-BCP-02 | Multiple BCP plans for linked processes | Store multiple read-only references. Do not merge BCP content. | PRD §8 · P1 |
| EC-BCP-03 | BCP plan retired/replaced | Update live reference on next read. Approved DR snapshot may still show the old BCP ID as historical context. | P1 |
| EC-BCP-04 | User edits BCP text from ITDR | Forbidden. Link only. | PRD §5 · P1 |
| EC-BCP-05 | Plan-to-process/asset shape differs from BCP (Crisis compatibility) | Defect against §7.5 minimum. Must match BCP's linkage structure even though invocation is deferred. | FR-2 · P1 |

---

## 9. Crisis Management (deferred — still test the shape)

Invocation UI is out of scope. These cases prevent painting into a corner.

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-CRS-01 | User tries to "invoke" or declare an incident from ITDR | No such action. Direct to Crisis Management. | PRD §5, D7 · P1 |
| EC-CRS-02 | Approved plan missing BCP-equivalent process/asset links | Fail a contract test. Fix data shape before calling Phase 1 done. | §7.5 min · P1 |
| EC-CRS-03 | Generic invocation (if later enabled) finds a `draft` or `expired` plan | Future: Crisis should prefer current `approved`. Do not expose drafts as invocable. Document for Crisis team. | FR-22 · Future |
| EC-CRS-04 | Multiple DR plans for one incident's affected systems | Future: return all linked **current approved** plans; commander chooses. Not ITDR's incident UI. | FR-22, FR-23 · Future |
| EC-CRS-05 | Live step checkoff vs a new version published mid-incident | Future: invocation is pinned to the **version invoked**. New approval does not mutate the in-flight checklist. | FR-25 · Future |
| EC-CRS-06 | Building a parallel ITDR notification channel for invoke | Forbidden now and later (FR-24). | FR-24 · Future |

---

## 10. Access control, tenancy, and audit

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-SEC-01 | Plan Owner of app A opens app B's draft | 403 unless Admin/DR Coordinator/Auditor (read) or they are owner. | FR-30 · P1 |
| EC-SEC-02 | Auditor exports; Executive views dashboard | Auditor: read + export evidence. Executive: aggregated dashboard; drill-down per BCM policy (Default: allowed, read-only). Neither can approve or edit. | FR-30 · P1–3 |
| EC-SEC-03 | Test Manager role in ITDR | They work in Testing. ITDR may show them read-only plan context. They cannot approve DR plans by that role alone. | PRD §6 · P2 |
| EC-SEC-04 | Admin impersonation / break-glass edit of approved version | Still no in-place edit. Break-glass creates a draft or recorded admin event; approved bytes stay. | FR-12 · P1 |
| EC-SEC-05 | Cross-tenant target ID in API | 404/403. No leakage in coverage counts. | BCM tenancy · P1 |
| EC-SEC-06 | Audit log correction | Append a compensating event. Do not update/delete the original approval row. | architecture §8 · P1 |
| EC-SEC-07 | Feature flag off | ITDR routes hidden. No partial nav. Existing BCM modules unaffected. | A1 · P1 |

---

## 11. Reporting and compliance (Phase 3)

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-RPT-01 | Export "as of" a historical date | Reconstruct which version was current, who had approved it, which tests were bound **as of that date**. Do not use today's live status. | FR-29, architecture §7.2 · P3 |
| EC-RPT-02 | Target with no tests in the range | Report shows no evidence of test; does not imply pass. | FR-29 · P3 |
| EC-RPT-03 | ISO clause with no mapped evidence type | Clause appears as **gap**, not omitted. | FR-29 · P3 |
| EC-RPT-04 | Concurrent exports | Isolated snapshots; no shared mutable buffer. | FR-29 · P3 |
| EC-RPT-05 | Gap analysis includes retired / out-of-scope BIA apps | Default: **current BIA scope** only, with an optional include-retired filter. | H5 · P3 |
| EC-RPT-06 | Manual spreadsheet upload as "the compliance report" | Not a substitute. On-demand export is the product path. | PRD §4 · P3 |

---

## 12. Integration and operational failures

| ID | Scenario | Expected behavior | FR / phase |
|---|---|---|---|
| EC-OPS-01 | BIA, Testing, or CMDB returns 5xx | Degrade: show last known + error banner. Do not corrupt snapshots. Retry with backoff. | P1–3 |
| EC-OPS-02 | Clock job (expiry) missed a day | Next run flags all windows that elapsed. Status is a function of timestamps, not of "job ran on time." | FR-19 · P1–2 |
| EC-OPS-03 | Partial deploy: ITDR Phase 2 against Testing without DR fields | Do not mark tests as passing. Contract tests should fail the release. | F5 · P2 |
| EC-OPS-04 | Existing BCP / Crisis / Testing flows regress | Treat as release blocker. ITDR is additive. | context.md · all |

---

## 13. Readiness truth table (regression fixtures)

Use these as automated fixtures. "Windows" means inside D4 review **and** test windows. Phase 1 ignores the Test column (`ready` is N/A).

| Fixture | Plan | Approval | In window | Bound pass on **current** version | Actual RTO/RPO meets target | Live BIA alignment | Phase 1 status | Phase 2 status |
|---|---|---|---|---|---|---|---|---|
| F1 | none | — | — | — | — | — | `not_started` | `not_started` |
| F2 | draft | no | — | — | — | n/a | `in_progress` | `in_progress` |
| F3 | current | yes | yes | no | — | yes | `approved_untested` | `approved_untested` |
| F4 | current | yes | yes | yes | yes | yes | `approved_untested` | `ready` |
| F5 | current | yes | no | yes | yes | yes | `expired` | `expired` |
| F6 | current | yes | yes | fail | — | yes | `approved_untested` | `failed_test` |
| F7 | current | yes | yes | pass | **no** | yes | `approved_untested` | `failed_test` |
| F8 | current | yes | yes | pass on **old** version only | yes | yes | `approved_untested` | `approved_untested` |
| F9 | current | yes | yes | yes | yes | **no** (tighter BIA) | `bia_drift` | `bia_drift` (not `ready`) |
| F10 | superseded only | — | — | pass on old | yes | yes | `not_started` / retired path | not `ready` |
| F11 | current | yes | yes | unbound pass | yes | yes | `approved_untested` | `approved_untested` |
| F12 | current | yes | yes | BCP Test pass | yes | yes | `approved_untested` | `approved_untested` |

Priority when F5+F6 both apply: `failed_test` still shown as a gap; composite Default `failed_test` if the failing test is on the **current** version, else `expired` (EC-RDY-02).

---

## 14. Explicit non-cases (do not build)

| Temptation | Why it is not an ITDR edge case to "solve" in-module |
|---|---|
| Create processes because BIA mapping is missing | BIA gap (EC-BIA-01) |
| Schedule the test on an ITDR calendar when Testing is down | Retry/outbox (EC-TST-11), do not fork a scheduler |
| Mark ready so the dashboard looks good for an audit | EC-APR-17 |
| Invoke DR from ITDR for a "small outage" | D7, EC-CRS-01 |
| Clone Crisis step-checkoff in Phase 1 | Deferred FR-25 |
| Auto-edit approved runbooks when BIA or CMDB changes | Snapshot + drift |
| Deduplicate BCP and DR into one plan | Scope boundary |

---

## 15. Suggested test priority

1. **P0 — false readiness:** F4 vs F3, F8, F11, F12, EC-APR-17, EC-TST-01, EC-TST-08.
2. **P0 — immutability:** EC-APR-07, EC-BIA-07, EC-AST-03, EC-RPT-01.
3. **P0 — one current plan:** EC-TGT-02, EC-APR-03, EC-APR-08.
4. **P1 — integration:** EC-TST-11, EC-BIA-14, EC-AST-06, EC-BCP-05.
5. **P1 — SoD and tenancy:** EC-APR-01, EC-SEC-01, EC-SEC-05.
6. **P2 — dashboard honesty:** EC-RDY-02, EC-RDY-04, EC-RDY-12, EC-TGT-07.
