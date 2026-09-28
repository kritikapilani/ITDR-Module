# ITDR Module — Disaster Recovery & Testing Platform

Enterprise IT Disaster Recovery (ITDR) management platform featuring DR Plan lifecycle management, Readiness Dashboard, and dedicated Testing sub-modules with clear separation between **ITDR Test Plans** and **ITDR Test Results**.

## Quick Start

```powershell
cd itdr
.\scripts\test.ps1
.\scripts\start.ps1
```

Open http://127.0.0.1:8787/itdr (or the port printed in the console).

---

## Core Modules & Navigation

### 1. Recovery Operations
* **DR Plan Builder (`#builder`):** Multi-section runbook authoring, RTO/RPO targets, tier classifications, infrastructure topologies, failover steps, and approval workflows.

### 2. Testing & Validation
* **📋 ITDR Test Plans (`#test-plans`):**
  * System-generated Test Plan IDs (e.g., `TP-2026-001`).
  * Test Type classification (*Tabletop Exercise*, *Simulation Test*, *Failover Test*, *Full DR Test*, *Other*).
  * Scope, scenario, recovery strategy, recovery environment / DR site, and planned window.
  * Dynamic **Step-by-Step Procedure Builder** with mandatory **Expected Results** per step.
  * Formal approval lifecycle: `Draft` $\rightarrow$ `Submitted` $\rightarrow$ `Approved` $\rightarrow$ `Ready for Execution` $\rightarrow$ `Executed` $\rightarrow$ `Closed`.
* **📊 ITDR Test Results (`#test-results`):**
  * System-generated Test Result IDs (e.g., `TR-2026-001`) bound to an approved ITDR Test Plan.
  * Actual telemetry: Actual execution date, start/end timestamps, actual recovery time (RTO achieved), actual RPO achieved.
  * Step-by-step verification: Record actual outcomes and step status (`Passed`, `Failed`, `Not Executed`, `Not Applicable`).
  * Live SLA Evaluation Engine: Automated determination of RTO/RPO `Met` vs `Breached` with variance buffer.
  * Corrective and remedial action item tracking (Action Owner, Target Closure Date, Status).
  * **⚖️ Expected vs Actual Comparison Overlay:** Side-by-side procedure matrix, RTO/RPO delta comparisons, and step pass rates.

### 3. Core & Governance
* **Readiness Dashboard (`#dashboard`):** Tier 1 & Tier 2 DR coverage KPIs, readiness statuses, drill-downs, and audit evidence.
* **Compliance & Audit Reports (`#audit`):** Complete audit trail of plan approvals, target overrides, and test telemetry.

