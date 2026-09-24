# ITDR Module — Project Context

## Product context

The organization's Business Continuity Management (BCM) application already includes:

- **Business Impact Analysis (BIA)** — process criticality, RTO/RPO, process-to-application mapping
- **Business Continuity Planning (BCP)** — business-side continuity plans
- **Crisis Management** — incident/crisis workflow and plan invocation
- **Testing** — exercise scheduling, execution, and results

These modules cover business continuity planning, incident response, and exercise management. They do **not** cover technical IT recovery of the applications and infrastructure those business processes depend on.

## Problem

IT disaster recovery planning is fragmented and disconnected from the BCM program:

1. **RTO/RPO gap** — Recovery Time and Recovery Point Objectives defined in BIA are not systematically linked to the technical systems that must meet them. Business expectations and IT recovery capability are not aligned.
2. **Uncontrolled runbooks** — DR runbooks, where they exist, live outside BCM (spreadsheets, shared drives, informal documents). There is no version control, ownership tracking, or approval workflow.
3. **No coverage visibility** — There is no reliable way to know which applications have a current, tested, and approved DR plan — and which do not.
4. **Untethered testing** — DR testing is not consistently scheduled or tracked. Results are not tied back to plan status, so a "successful test" claim often cannot be substantiated.
5. **No readiness reporting** — There is no centralized reporting on IT recovery readiness, making it difficult to demonstrate compliance with ISO 22301 and ISO/IEC 27031, or to satisfy internal/external audit requirements.

### Open item (not a confirmed gap)

Crisis Management already has a working plan-invocation mechanism (currently used for BCP plans). Whether DR plans can use this same mechanism without new integration work, or require an extension, must be confirmed with the team that built that link.

## Impact

- Increased risk of extended downtime during an actual disaster — recovery procedures are not readily accessible, current, or validated.
- Inability to verify that IT recovery capability actually meets the RTOs/RPOs the business believes it has.
- Duplicated effort and inconsistent recovery documentation across teams and applications.
- Audit and compliance exposure due to lack of traceable evidence of DR plan currency and test history.

## Objective

Introduce an **ITDR (IT Disaster Recovery)** module within the BCM application that:

1. **Inherits BIA data** — RTO/RPO and process-to-application mapping come from BIA; no duplicate data entry.
2. **Structured runbooks** — Build, version, and approve technical DR runbooks per application/infrastructure component.
3. **Integrates with Testing** — Adds a distinct DR Test type. Recovery plans are tested and re-certified on a defined cycle; results feed directly into plan readiness status.
4. **Crisis Management compatible** — Structure DR plan data so it is linkage-compatible with Crisis Management's existing plan-invocation mechanism. Defer any new integration work until that mechanism's extensibility is assessed.
5. **Readiness dashboard and reporting** — Surface DR plan coverage, currency, and test history against relevant standards (ISO 22301, ISO/IEC 27031), in an audit-ready form.

## Scope boundary

| Owned by ITDR | Not owned by ITDR (integrate, do not replace) |
|---|---|
| Technical recovery plans | Business-side continuity plans (BCP) |
| Asset and dependency data | Incident/crisis workflow (Crisis Management) |
| DR plan versioning, ownership, approval | Test scheduling and execution engine (Testing) |
| DR readiness status derived from plan + test results | BIA data (RTO/RPO, process-to-application mapping) — consume, do not duplicate |

## Downstream implications for design

- ITDR is a **consumer** of BIA, Testing, and (later) Crisis Management — not a parallel system of record for those domains.
- Plan readiness is a **derived** status (plan currency + approval + test results), not a free-standing field.
- Crisis invocation is a **compatibility constraint** on data shape, not a confirmed Phase 1 integration.
- Compliance evidence (who approved, when tested, what version was current) is a first-class requirement, not a reporting afterthought.
