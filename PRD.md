# Product Requirements Document (PRD)
## Stitch Enterprise ITDR (IT Disaster Recovery) Management Platform

**Document Version:** 2.0  
**Status:** Implemented & Verified (Phases 0–2)  
**Classification:** Enterprise BCM / IT Resilience  
**Reference Standards:** ISO 22301:2019, ISO/IEC 27031:2011, NIST SP 800-34 Rev. 1  

---

## 1. Executive Summary & Objective

The **Stitch Enterprise ITDR Management Platform** is a dedicated module within the Business Continuity Management (BCM) suite. It bridges the critical gap between business-level continuity requirements and technical recovery execution by systematically linking Business Impact Analysis (BIA) objectives to technical IT recovery runbooks, automated DR testing telemetry, and audit-ready governance dashboards.

### Core Objectives
1. **Automated Inheritance:** Inherit application definitions, process dependencies, and RTO/RPO requirements from BIA using the "most demanding" roll-up rule.
2. **Versioned Runbook Management:** Provide an intuitive, multi-step DR Plan Builder with template support, rollback procedures, and strict Segregation of Duties (SoD) approval workflows.
3. **Bi-Directional Testing Integration:** Integrate with the Testing lifecycle through dedicated **ITDR Test Plans** and **ITDR Test Results** sub-modules, binding execution telemetry to specific plan versions.
4. **Autonomous Readiness Engine:** Dynamically calculate application resilience posture (Ready, Untested, Failed Test, Expired, Drifted) based on immutable evidence and SLA thresholds.
5. **Audit & Compliance Governance:** Deliver real-time compliance reporting and immutable audit trails aligned with ISO 22301, ISO 27031, and NIST standards.

---

## 2. Personas & Access Control Matrix (RBAC)

The platform enforces strict role-based access control and separation of concerns across BCM and IT personas:

| Persona | Role Key | Permissions & Scope |
| :--- | :--- | :--- |
| **BCM / System Admin** | `ADMIN` | Full administrative control: asset inventory registration, global policy configuration, tenant feature flags, user role assignments, and emergency overrides. |
| **Technical Plan Owner** | `PLAN_OWNER` | Authors and maintains DR plans, adds technical assets/dependencies, requests reviews, and views assigned application readiness. *Cannot approve own plans.* |
| **DR Plan Approver** | `APPROVER` | Reviews submitted DR plans and Test Plans, validates technical recovery steps against BIA requirements, and issues formal approval/rejection. |
| **Compliance Auditor** | `AUDITOR` | Read-only access to all published plans, execution logs, override justifications, and compliance export reports. |
| **Executive Stakeholder** | `EXECUTIVE` | Read-only access to executive readiness dashboards, enterprise coverage KPIs, and resilience posture summaries. |
| **Test Manager (BCM)** | `TEST_MANAGER` | External BCM persona interacting via Testing contracts; forbidden from mutating core ITDR plan records. |

---

## 3. Architecture & System Context

```
+---------------------------------------------------------------------------------+
|                               Enterprise BCM Suite                              |
|                                                                                 |
|  +--------------------+      +-----------------------------------------------+  |
|  |     BIA Module     | ===> |            ITDR Management Module             |  |
|  | (Process, RTO/RPO) |      |                                               |  |
|  +--------------------+      |  * IT Application & Asset Inventory (#coverage)|  |
|                              |  * DR Plan Builder & Runbooks (#builder)      |  |
|  +--------------------+      |  * Readiness Calculation Engine               |  |
|  |    Crisis Mgmt     | <... |  * Compliance & Audit Reports (#audit)        |  |
|  | (Invocation/Alert) |      +-----------------------------------------------+  |
|  +--------------------+                             ||                          |
|                                                     || Bidirectional Contract   |
|                                                     \/                          |
|                              +-----------------------------------------------+  |
|                              |             Testing & Validation              |  |
|                              |  * ITDR Test Plans (#test-plans)              |  |
|                              |  * ITDR Test Results (#test-results)          |  |
|                              |  * Automated SLA / Questionnaire Engine       |  |
|                              +-----------------------------------------------+  |
+---------------------------------------------------------------------------------+
```

### Architectural Decisions (D1–D7)
- **D1 (Asset Inventory):** Native ITDR technical inventory paired with an extensible CMDB/ITSM adapter.
- **D2 (BIA Identity & Grain):** Stable key = `biaApplicationId`. Grain = exactly one recovery target per BIA application. Roll-up = lowest non-null RTO and lowest non-null RPO across all mapped processes.
- **D3 (Version Binding):** DR Test execution must explicitly bind to an approved `planVersionId`. Unbound test results do not contribute to readiness.
- **D4 (Recertification Window):** Configurable 12-month recertification cadence across Tiers 1–3.
- **D5 (Approval Authority):** Segregation of Duties enforced — `authorUserId !== approverUserId`.
- **D6 (Crisis Integration):** BCP-compatible linkage schema; invocation execution remains owned by Crisis Management.
- **D7 (Scope Boundary):** DR invocation is strictly owned by Crisis Management, not triggered ad-hoc from ITDR.

---

## 4. Functional Specifications by Module

### 4.1 IT Applications & Asset Inventory (`#coverage`, `#target/:id`)
- **Application Registry:** Comprehensive listing of in-scope business applications with Tier classification (Tier 1 Mission Critical, Tier 2 Business Critical, Tier 3 Non-Critical), hosting model (AWS, Azure, GCP, On-Prem, Hybrid, SaaS), and assigned primary/backup custodians.
- **Technical Asset Graph:** Register underlying infrastructure components (databases, web tiers, microservices) and declare upstream/downstream dependency links with cycle detection.
- **Objective Inheritance & Overrides:**
  - Automatic inheritance of BIA RTO and RPO.
  - Manual RTO/RPO override capability requiring mandatory justification text, logged in the audit trail.
- **Actions:** "+ Add application", "+ New DR Plan", and direct drill-downs into runbooks and test history.

### 4.2 DR Plan Builder & Runbook Workspace (`#builder`, `#target/:id/runbook`)
- **Templates:** Pre-configured baseline templates by recovery strategy (`hot_site`, `warm_site`, `cold_site`, `cloud_dr`, `backup_restore`).
- **Runbook Authoring:**
  - Ordered sequential steps with step title, detailed execution instructions, responsible team role, prerequisites, estimated duration, rollback procedure, and verification criteria.
  - Emergency contacts and escalation hierarchy with notification order.
  - Architecture diagrams and SLA attachment references.
- **Lifecycle & Versioning States:**
  - `draft`: Editable by Plan Owner.
  - `in_review`: Locked for review; editable only after withdrawal.
  - `approved`: Formally approved; immutable.
  - `published`: Active production plan; triggers scheduled test generation.
  - `expired`: Plan exceeding the 12-month recertification window.
- **Approval Workflow:** Strict validation ensuring required fields, contact roles, and SoD compliance before transition to `approved`.

### 4.3 Testing & Validation Sub-Modules

#### A. ITDR Test Plans (`#test-plans`)
- Dedicated workspace for planning pre-execution failover tests.
- Captures test parameters: Linked DR Plan, target RTO/RPO expectations, planned execution window, exercise mode (`tabletop`, `simulation`, `component_failover`, `full_datacenter_failover`), lead coordinator, and participating technical teams.
- Independent approval workflow before test execution can commence.

#### B. ITDR Test Results & Telemetry (`#test-results`)
- Post-execution telemetry capture: Actual RTO achieved, Actual RPO achieved, start/end timestamps, step-by-step pass/fail execution log.
- **Automated SLA Comparison Engine:** Compares planned vs. actual recovery times.
  - If `actualRtoMinutes > effectiveRtoMinutes`, the system derives a `FAIL` status regardless of manual notes.
- **Structured Assessment Questionnaire:** Standardized verification questions deriving gap ratings and mandatory remediation items.
- **Remediation Trigger:** Automatic transition of application status to `failed_test` / `under_remediation` on any failed test.

### 4.4 Readiness Engine & Executive Dashboard (`#dashboard`)
- **Key Performance Indicators (KPIs):**
  - Enterprise DR Coverage Rate (% of Tier 1/2 apps with approved, current plans).
  - Test Compliance Rate (% of plans tested within the 12-month policy window).
  - RTO/RPO Achievement Rate (% of tests meeting or beating business SLA).
  - Open Remediation Items & Gap Distribution.
- **Derived Readiness States:**
  - `ready`: Approved plan with a passing, in-cycle test bound to the active version.
  - `approved_untested`: Newly approved plan awaiting baseline test validation.
  - `failed_test`: Most recent bound test failed or exceeded RTO threshold.
  - `expired`: Active plan or test exceeding recertification timeframe.
  - `drift`: BIA tightened recovery objectives after plan approval, flagging re-alignment need.

### 4.5 Compliance & Audit Governance (`#audit`)
- Real-time immutable audit trail capturing timestamp, actor, action, previous value, and new value for all plan modifications, approvals, rejections, overrides, and test telemetry.
- On-demand compliance report generator mapped to:
  - **ISO 22301 (Clause 8.4):** Business continuity procedures & recovery capabilities.
  - **ISO/IEC 27031 (Clause 6.3):** ICT readiness testing, evaluation, and verification.
  - **NIST SP 800-34:** Contingency planning and technical recovery validation.

---

## 5. Data Contracts & API Surface

### 5.1 Core REST Endpoints
- `GET /api/itdr/coverage` — List all applications with inherited BIA objectives and plan statuses.
- `GET /api/itdr/targets/:id` — Application detail, asset dependency graph, active versions, and test history.
- `POST /api/itdr/targets/:id/plan` — Create a new DR plan draft.
- `PATCH /api/itdr/targets/:id` — Update application-level technical attributes or RTO/RPO overrides.
- `PATCH /api/itdr/versions/:versionId` — Save runbook steps, strategy, and contact definitions.
- `POST /api/itdr/versions/:versionId/submit` — Submit draft for formal review.
- `POST /api/itdr/versions/:versionId/approve` — Approve plan (enforces SoD).
- `POST /api/itdr/versions/:versionId/publish` — Publish approved plan and queue DR test recertification.
- `GET /api/itdr/test-plans` & `POST /api/itdr/test-plans` — Manage ITDR Test Plans.
- `GET /api/itdr/test-results` & `POST /api/itdr/test-results` — Manage ITDR Test Results and telemetry.
- `GET /api/itdr/readiness` — Real-time readiness posture and KPI aggregations.
- `GET /api/itdr/audit` — Immutable governance and compliance logs.

---

## 6. Success Metrics & Quality Standards

| Metric | Target | Current Status |
| :--- | :--- | :--- |
| **Tier 1 Application DR Coverage** | 100% approved plans | Enabled & Monitored |
| **Annual Test Recertification** | 100% within 12 months | Automated policy tracking |
| **RTO / RPO SLA Adherence** | >= 95% of tested applications | Automated telemetry validation |
| **Audit Evidence Generation Time** | < 1 minute (On-demand) | Instant report export |
| **Automated Test Suite Pass Rate** | 100% | 51/51 tests passing |
