# Sprint 0 — Locked decisions (D1–D7)

Recorded: **2026-09-21**  
Owner: **ITDR Sprint 0** (defaults from `implementation-plan.md` §4.1)  
Status: **DEFAULTED — pending confirmation** from the owning BCM team except D7 (closed).

These defaults unblock the module shell. They are **not** a production schema. Phase 1 must not contradict D2 (BIA identity/roll-up) or D6 (Crisis shape unknown → match BCP linkage, no invocation UI).

| ID | Decision | Default in force | Confirm with | Status |
|---|---|---|---|---|
| D1 | Authoritative IT asset inventory | Native ITDR inventory **plus** a CMDB adapter interface. Real sync is Phase 3 if the CMDB source is still unclear. | CMDB/ITSM + BCM Admin | DEFAULTED |
| D2 | BIA application identity, grain, RTO/RPO roll-up | Stable key = `biaApplicationId`. Grain = **one recovery target per BIA application**. Roll-up = **most demanding** (lowest non-null RTO and lowest non-null RPO among linked processes). | BIA team | DEFAULTED |
| D3 | Testing registration and `planVersionId` binding | Contract drafted in this sprint (`DR_TEST` type + bound results). Implementation is Phase 2. Unbound results do not count toward readiness. | Testing team | DEFAULTED |
| D4 | Recertification window by tier | Configurable policy object. Seed **12 months** for Tier 1, 2, and 3 until BCM policy is confirmed. | BCM policy / InfoSec | DEFAULTED |
| D5 | Approval authority | Single `APPROVER` role. Segregation of duties: **author ≠ approver**. Workflow engine must allow extra steps later. | BCM policy | DEFAULTED |
| D6 | Crisis invocation: generic vs BCP-hardcoded | **Unknown.** Match BCP plan-to-process/asset linkage. No invocation UI in ITDR. | Crisis team that built the BCP link | DEFAULTED |
| D7 | Invoke DR from ITDR for small outages? | **No.** Invocation remains Crisis-owned. | Product (closed) | **LOCKED** |

## Implications encoded in the shell

- No SQL/migrations in this sprint (exit criterion: do not lock a production schema that contradicts D2 or D6).
- `TEST_MANAGER` is a BCM persona, not an ITDR role — no ITDR scheduler permissions.
- Feature flag `itdr.enabled` gates the module area.
