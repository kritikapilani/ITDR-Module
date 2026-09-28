import { recertificationMonths } from "./decisions.mjs";
import { TESTING_CONTRACT } from "./contracts.mjs";
import { clone, fail, newId, addMonths } from "./httpError.mjs";
import { deriveTestOutcome } from "./testQuestionnaire.mjs";

export const DR_TEST = TESTING_CONTRACT.testTypeCode;
export const BCP_TEST = "BCP_TEST";

export const TEST_TYPES = Object.freeze([
  "Tabletop Exercise",
  "Simulation Test",
  "Failover Test",
  "Full DR Test",
  "Other",
]);

export const TEST_PLAN_STATUSES = Object.freeze([
  "Draft",
  "Submitted",
  "Approved",
  "Ready for Execution",
  "Executed",
  "Closed",
]);

export const TEST_RESULT_STATUSES = Object.freeze([
  "Passed",
  "Passed with Observations",
  "Failed",
]);

export const STEP_STATUSES = Object.freeze([
  "Passed",
  "Failed",
  "Not Executed",
  "Not Applicable",
]);

export const EXERCISE_MODES = Object.freeze(["tabletop", "simulation", "full_failover"]);

export function createTestingModule({ now = () => new Date() } = {}) {
  const tests = new Map();
  const testPlans = new Map();
  const testResults = new Map();

  const types = [
    { code: BCP_TEST, label: "BCP Test" },
    { code: DR_TEST, label: "DR Test" },
  ];
  let createBlocked = false;

  function listOpenForVersion(planVersionId) {
    return [...tests.values()].find(
      (t) => t.testType === DR_TEST && t.planVersionId === planVersionId && ["open", "in_progress"].includes(t.status)
    );
  }

  // --- Seed Initial Test Plans & Results ---
  function seedSampleData() {
    const p1Id = "TP-2026-001";
    const p1 = {
      testPlanId: p1Id,
      applicationName: "Global Core Banking Engine",
      targetBiaApplicationId: "bia-app-core-banking",
      businessUnit: "Retail & Core Banking Operations",
      applicationOwnerUserId: "user-plan-owner",
      applicationOwnerName: "Alex Owner",
      itdrOwnerUserId: "user-admin",
      itdrOwnerName: "Renu Shah",
      testType: "Failover Test",
      testObjective: "Validate automated database failover to secondary AWS datacenter and verify zero customer transaction loss under 4 hours.",
      testScope: "Core Ledger, Transaction Processing Engine, PostgreSQL Primary Replica, MQ Broker failover.",
      testScenario: "Simulated primary datacenter power failure with instantaneous DNS reroute and stand-by replica promotion.",
      recoveryStrategy: "Hot Site (Active-Passive Cloud Failover)",
      plannedTestDate: "2026-10-15",
      plannedStartTime: "02:00",
      plannedEndTime: "06:00",
      targetRtoMinutes: 240, // 4 hours
      targetRpoMinutes: 30,  // 30 minutes
      recoveryEnvironment: "Secondary DR Site (AWS eu-west-1)",
      dependencies: "AWS DirectConnect 10Gbps, Cross-Region Aurora Replication, Active Directory DR Replica",
      participants: ["Renu Shah (DR Coordinator)", "Alex Owner (App Owner)", "Sam Chen (Lead DBA)", "Maria Gomez (Infra Ops)", "Terry Smith (QA Lead)"],
      rolesResponsibilities: "DR Coordinator: Incident declaration and drill timer. DBA: Aurora cluster promotion. Infra: Route53 DNS flip. QA: Sanity testing.",
      steps: [
        {
          stepNumber: 1,
          title: "Declaration & Pre-Flight Checks",
          procedure: "Verify stand-by environment telemetry and declare DR drill window.",
          assigneeRole: "DR Coordinator",
          expectedResult: "All stakeholders confirmed on bridge; replication lag verified < 2 minutes.",
        },
        {
          stepNumber: 2,
          title: "Isolate Primary Datacenter",
          procedure: "Sever active ingress traffic and freeze primary database writes.",
          assigneeRole: "Infra Ops",
          expectedResult: "Ingress traffic stopped cleanly; no in-flight write locks held.",
        },
        {
          stepNumber: 3,
          title: "Promote Secondary Aurora Database",
          procedure: "Trigger failover command on AWS Aurora read replica to become primary read-write cluster.",
          assigneeRole: "Lead DBA",
          expectedResult: "Secondary DB promoted to master within 15 minutes with read-write access active.",
        },
        {
          stepNumber: 4,
          title: "DNS Switch & Gateway Route Update",
          procedure: "Update Route53 weighted records and internal API gateway endpoints to point to DR site.",
          assigneeRole: "Infra Ops",
          expectedResult: "Global DNS resolves to DR site IPs; API requests route successfully.",
        },
        {
          stepNumber: 5,
          title: "Core Banking Transaction Validation",
          procedure: "Execute 100 synthetic transaction test cases across retail, loan, and settlement accounts.",
          assigneeRole: "QA Lead",
          expectedResult: "100% synthetic transaction pass rate; balances verified against ledger snapshot.",
        },
      ],
      successCriteria: "RTO <= 240 mins, RPO <= 30 mins, 100% synthetic test pass rate, no ledger discrepancy.",
      requiredEvidence: "AWS CloudWatch promotion logs, Route53 TTL cutover timestamp logs, Synthetic test runner execution report.",
      risksConstraints: "High network bandwidth consumption during sync; maintenance window strictly limited to 4 hours.",
      remarks: "Annual Tier 1 compliance test mandatory under ISO 22301 framework.",
      status: "Ready for Execution", // Draft -> Submitted -> Approved -> Ready for Execution -> Executed -> Closed
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      submittedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      approvedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      approvedBy: "user-approver",
      approvalNotes: "Plan reviewed and approved for Q4 execution window.",
    };
    testPlans.set(p1Id, p1);

    const r1Id = "TR-2026-001";
    const r1 = {
      resultId: r1Id,
      testPlanId: p1Id,
      applicationName: p1.applicationName,
      targetBiaApplicationId: p1.targetBiaApplicationId,
      actualTestDate: "2026-09-20",
      actualStartTime: "02:00",
      actualEndTime: "05:30",
      actualRecoveryTimeMinutes: 210, // 3h 30m (Target was 240 mins -> MET)
      actualRpoAchievedMinutes: 20,   // 20 mins (Target was 30 mins -> MET)
      overallResult: "Passed",        // Passed | Passed with Observations | Failed
      stepResults: [
        {
          stepNumber: 1,
          stepTitle: "Declaration & Pre-Flight Checks",
          expectedResult: "All stakeholders confirmed on bridge; replication lag verified < 2 minutes.",
          actualResult: "Bridge initiated on time; replication lag measured at 45 seconds.",
          stepStatus: "Passed",
          durationMinutes: 10,
          executionNotes: "Executed without delays.",
        },
        {
          stepNumber: 2,
          stepTitle: "Isolate Primary Datacenter",
          procedure: "Sever active ingress traffic and freeze primary database writes.",
          expectedResult: "Ingress traffic stopped cleanly; no in-flight write locks held.",
          actualResult: "Traffic cut successfully; write queues drained in 4 minutes.",
          stepStatus: "Passed",
          durationMinutes: 15,
          executionNotes: "Smooth cutover.",
        },
        {
          stepNumber: 3,
          stepTitle: "Promote Secondary Aurora Database",
          expectedResult: "Secondary DB promoted to master within 15 minutes with read-write access active.",
          actualResult: "Aurora promotion took 12 minutes; read-write confirmed.",
          stepStatus: "Passed",
          durationMinutes: 12,
          executionNotes: "Completed faster than expected threshold.",
        },
        {
          stepNumber: 4,
          stepTitle: "DNS Switch & Gateway Route Update",
          expectedResult: "Global DNS resolves to DR site IPs; API requests route successfully.",
          actualResult: "DNS propagation took 18 minutes due to cached TTL on external resolvers.",
          stepStatus: "Passed",
          durationMinutes: 18,
          executionNotes: "Resolved within tolerance.",
        },
        {
          stepNumber: 5,
          stepTitle: "Core Banking Transaction Validation",
          expectedResult: "100% synthetic transaction pass rate; balances verified against ledger snapshot.",
          actualResult: "100/100 synthetic test cases passed; zero ledger delta.",
          stepStatus: "Passed",
          durationMinutes: 45,
          executionNotes: "All assertions passed.",
        },
      ],
      evidenceAttachments: "https://audit-vault.enterprise.internal/evidence/TR-2026-001-cutover-report.pdf",
      issuesObservations: "External DNS resolution had a minor 5-minute lag due to 300s TTL cache on older third-party provider resolvers.",
      deviationFromPlan: "None. All steps followed standard operating procedure.",
      rootCause: "N/A - successful drill.",
      correctiveActions: [
        {
          actionId: "ACT-001",
          actionDescription: "Lower Route53 public TTL from 300s to 60s prior to future planned drill windows.",
          actionOwner: "Maria Gomez (Infra Ops)",
          targetClosureDate: "2026-11-01",
          actionStatus: "In Progress",
        },
      ],
      remarks: "Full drill completed within approved change window. System demonstrated high resilience.",
      recordedBy: "user-admin",
      recordedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    };
    testResults.set(r1Id, r1);
    p1.status = "Executed";

    // Seed Second Test Plan (Payments Gateway - Simulation)
    const p2Id = "TP-2026-002";
    const p2 = {
      testPlanId: p2Id,
      applicationName: "Payments Gateway",
      targetBiaApplicationId: "bia-app-payments",
      businessUnit: "Digital Payments & Treasury",
      applicationOwnerUserId: "user-plan-owner",
      applicationOwnerName: "Alex Owner",
      itdrOwnerUserId: "user-admin",
      itdrOwnerName: "Renu Shah",
      testType: "Simulation Test",
      testObjective: "Test payment authorization engine failover under peak simulated load of 5,000 TPS.",
      testScope: "Payment Switch, Tokenization Vault, Fraud Detection Pipeline, Card Network Gateways.",
      testScenario: "Cloud region partition with automatic container re-orchestration on DR Kubernetes cluster.",
      recoveryStrategy: "Warm Site (Multi-Cloud Failover)",
      plannedTestDate: "2026-11-10",
      plannedStartTime: "01:00",
      plannedEndTime: "03:30",
      targetRtoMinutes: 120, // 2 hours
      targetRpoMinutes: 15,  // 15 minutes
      recoveryEnvironment: "GCP Disaster Recovery Cluster (europe-west3)",
      dependencies: "Kafka MirrorMaker 2, Redis Enterprise Active-Active, Vault HSM Sync",
      participants: ["Renu Shah (Coordinator)", "Alex Owner (Owner)", "Vikram Patel (Payments Architect)", "Dave Miller (SecOps)"],
      rolesResponsibilities: "Architect: Load generator management. SecOps: Vault HSM validation. Coordinator: Metrics capture.",
      steps: [
        {
          stepNumber: 1,
          title: "Warm Cluster Pre-Warming",
          procedure: "Scale DR Kubernetes deployment replicas to 100% capacity.",
          assigneeRole: "Payments Architect",
          expectedResult: "All pods in Ready state; Redis cache warm hit ratio > 90%.",
        },
        {
          stepNumber: 2,
          title: "Inject Primary Gateway Latency",
          procedure: "Introduce 500ms artificial network latency to trigger automated health check failover.",
          assigneeRole: "SecOps",
          expectedResult: "Global Load Balancer detects latency and redirects 100% traffic to DR cluster.",
        },
        {
          stepNumber: 3,
          title: "Tokenization & Settlement Verification",
          procedure: "Submit 5,000 synthetic transaction authorizations and verify webhook responses.",
          assigneeRole: "QA Lead",
          expectedResult: "Authorization latency < 120ms; 0 dropped transaction webhooks.",
        },
      ],
      successCriteria: "RTO <= 120m, RPO <= 15m, 0 payment auth failure.",
      requiredEvidence: "Kibana latency graphs, Vault token sync log, GCP Cloud Run load reports.",
      risksConstraints: "Potential duplicate webhook delivery if idempotency keys fail.",
      remarks: "Mandatory bi-annual PCI-DSS DR testing compliance.",
      status: "Approved",
      createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      submittedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      approvedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      approvedBy: "user-approver",
      approvalNotes: "Approved. Ensure merchant notification is broadcast prior to test start.",
    };
    testPlans.set(p2Id, p2);

    // Seed Third Test Plan (HR Portal - Draft)
    const p3Id = "TP-2026-003";
    const p3 = {
      testPlanId: p3Id,
      applicationName: "HR Portal",
      targetBiaApplicationId: "bia-app-hr",
      businessUnit: "Human Resources & Payroll",
      applicationOwnerUserId: "user-plan-owner",
      applicationOwnerName: "Alex Owner",
      itdrOwnerUserId: "user-admin",
      itdrOwnerName: "Renu Shah",
      testType: "Tabletop Exercise",
      testObjective: "Walk through payroll disaster recovery runbook and review vendor escalation SLA.",
      testScope: "SaaS HR vendor failover, Employee record backup restoration, Payroll batch reroute.",
      testScenario: "SaaS vendor major outage 48 hours prior to monthly payroll execution cutoff.",
      recoveryStrategy: "SaaS Vendor Secondary Instance + Local Cold DB",
      plannedTestDate: "2026-11-25",
      plannedStartTime: "10:00",
      plannedEndTime: "12:00",
      targetRtoMinutes: 480, // 8 hours
      targetRpoMinutes: 120, // 2 hours
      recoveryEnvironment: "Vendor Secondary Tenant (Workday EU-DR)",
      dependencies: "Vendor Enterprise Support Contract SLA (2hr response)",
      participants: ["Renu Shah (Coordinator)", "Alex Owner (HR Lead)", "HR Ops Team"],
      rolesResponsibilities: "HR Lead: Review emergency manual payroll checklists.",
      steps: [
        {
          stepNumber: 1,
          title: "Incident Declaration & Vendor Ticket",
          procedure: "Open Critical Priority P1 ticket with Workday support bridge.",
          assigneeRole: "HR Ops Lead",
          expectedResult: "Vendor bridge response confirmed within 30 minutes.",
        },
        {
          stepNumber: 2,
          title: "Activate Offline Payroll Ledger",
          procedure: "Extract last clean employee master snapshot from encrypted on-prem backup.",
          assigneeRole: "DBA",
          expectedResult: "Offline payroll calculator generates ACH files successfully.",
        },
      ],
      successCriteria: "All stakeholders aligned on emergency manual payment fallback.",
      requiredEvidence: "Tabletop participant sign-off sheet and updated escalation matrix.",
      risksConstraints: "None (Tabletop simulation only).",
      remarks: "Drafting in progress.",
      status: "Draft",
      createdAt: new Date().toISOString(),
    };
    testPlans.set(p3Id, p3);
  }

  seedSampleData();

  return {
    types: () => clone(types),
    setCreateBlocked(value) {
      createBlocked = Boolean(value);
    },

    // --- ITDR Test Plans API ---
    listTestPlans(filter = {}) {
      return [...testPlans.values()]
        .filter((p) => {
          if (filter.status && p.status !== filter.status) return false;
          if (filter.targetBiaApplicationId && p.targetBiaApplicationId !== filter.targetBiaApplicationId) return false;
          if (filter.testType && p.testType !== filter.testType) return false;
          return true;
        })
        .map(clone)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    },

    getTestPlan(id) {
      const plan = testPlans.get(id);
      if (!plan) fail(404, "Test Plan not found", "NOT_FOUND");
      return clone(plan);
    },

    createTestPlan(body, actor) {
      if (createBlocked) fail(503, "Testing module unavailable", "TESTING_DOWN");
      const testPlanId = body.testPlanId || `TP-${new Date().getFullYear()}-${String(testPlans.size + 1).padStart(3, "0")}`;
      const plan = {
        testPlanId,
        applicationName: body.applicationName || "Unnamed Application",
        targetBiaApplicationId: body.targetBiaApplicationId || null,
        businessUnit: body.businessUnit || "Enterprise IT",
        applicationOwnerUserId: body.applicationOwnerUserId || actor?.userId || null,
        applicationOwnerName: body.applicationOwnerName || actor?.displayName || "Application Owner",
        itdrOwnerUserId: body.itdrOwnerUserId || actor?.userId || null,
        itdrOwnerName: body.itdrOwnerName || actor?.displayName || "ITDR Coordinator",
        testType: body.testType || "Failover Test",
        testObjective: body.testObjective || "",
        testScope: body.testScope || "",
        testScenario: body.testScenario || "",
        recoveryStrategy: body.recoveryStrategy || "",
        plannedTestDate: body.plannedTestDate || "",
        plannedStartTime: body.plannedStartTime || "",
        plannedEndTime: body.plannedEndTime || "",
        targetRtoMinutes: body.targetRtoMinutes != null ? Number(body.targetRtoMinutes) : null,
        targetRpoMinutes: body.targetRpoMinutes != null ? Number(body.targetRpoMinutes) : null,
        recoveryEnvironment: body.recoveryEnvironment || "",
        dependencies: body.dependencies || "",
        participants: Array.isArray(body.participants) ? body.participants : (body.participants ? String(body.participants).split(/[,|\n]/).map((s) => s.trim()).filter(Boolean) : []),
        rolesResponsibilities: body.rolesResponsibilities || "",
        steps: (body.steps || []).map((s, idx) => ({
          stepNumber: s.stepNumber ?? idx + 1,
          title: s.title || s.stepTitle || "",
          procedure: s.procedure || s.description || "",
          assigneeRole: s.assigneeRole || s.ownerRole || "",
          expectedResult: s.expectedResult || "",
        })),
        successCriteria: body.successCriteria || "",
        requiredEvidence: body.requiredEvidence || "",
        risksConstraints: body.risksConstraints || "",
        remarks: body.remarks || "",
        status: "Draft",
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
      };
      testPlans.set(testPlanId, plan);
      return clone(plan);
    },

    updateTestPlan(id, body, actor) {
      const plan = testPlans.get(id);
      if (!plan) fail(404, "Test Plan not found", "NOT_FOUND");
      if (plan.status === "Executed" || plan.status === "Closed") {
        fail(400, `Cannot edit Test Plan in '${plan.status}' status.`, "IMMUTABLE_STATUS");
      }

      Object.assign(plan, {
        applicationName: body.applicationName !== undefined ? body.applicationName : plan.applicationName,
        targetBiaApplicationId: body.targetBiaApplicationId !== undefined ? body.targetBiaApplicationId : plan.targetBiaApplicationId,
        businessUnit: body.businessUnit !== undefined ? body.businessUnit : plan.businessUnit,
        applicationOwnerUserId: body.applicationOwnerUserId !== undefined ? body.applicationOwnerUserId : plan.applicationOwnerUserId,
        applicationOwnerName: body.applicationOwnerName !== undefined ? body.applicationOwnerName : plan.applicationOwnerName,
        itdrOwnerUserId: body.itdrOwnerUserId !== undefined ? body.itdrOwnerUserId : plan.itdrOwnerUserId,
        itdrOwnerName: body.itdrOwnerName !== undefined ? body.itdrOwnerName : plan.itdrOwnerName,
        testType: body.testType !== undefined ? body.testType : plan.testType,
        testObjective: body.testObjective !== undefined ? body.testObjective : plan.testObjective,
        testScope: body.testScope !== undefined ? body.testScope : plan.testScope,
        testScenario: body.testScenario !== undefined ? body.testScenario : plan.testScenario,
        recoveryStrategy: body.recoveryStrategy !== undefined ? body.recoveryStrategy : plan.recoveryStrategy,
        plannedTestDate: body.plannedTestDate !== undefined ? body.plannedTestDate : plan.plannedTestDate,
        plannedStartTime: body.plannedStartTime !== undefined ? body.plannedStartTime : plan.plannedStartTime,
        plannedEndTime: body.plannedEndTime !== undefined ? body.plannedEndTime : plan.plannedEndTime,
        targetRtoMinutes: body.targetRtoMinutes !== undefined ? Number(body.targetRtoMinutes) : plan.targetRtoMinutes,
        targetRpoMinutes: body.targetRpoMinutes !== undefined ? Number(body.targetRpoMinutes) : plan.targetRpoMinutes,
        recoveryEnvironment: body.recoveryEnvironment !== undefined ? body.recoveryEnvironment : plan.recoveryEnvironment,
        dependencies: body.dependencies !== undefined ? body.dependencies : plan.dependencies,
        participants: body.participants !== undefined ? (Array.isArray(body.participants) ? body.participants : String(body.participants).split(/[,|\n]/).map((s) => s.trim()).filter(Boolean)) : plan.participants,
        rolesResponsibilities: body.rolesResponsibilities !== undefined ? body.rolesResponsibilities : plan.rolesResponsibilities,
        steps: body.steps ? body.steps.map((s, idx) => ({
          stepNumber: s.stepNumber ?? idx + 1,
          title: s.title || s.stepTitle || "",
          procedure: s.procedure || s.description || "",
          assigneeRole: s.assigneeRole || s.ownerRole || "",
          expectedResult: s.expectedResult || "",
        })) : plan.steps,
        successCriteria: body.successCriteria !== undefined ? body.successCriteria : plan.successCriteria,
        requiredEvidence: body.requiredEvidence !== undefined ? body.requiredEvidence : plan.requiredEvidence,
        risksConstraints: body.risksConstraints !== undefined ? body.risksConstraints : plan.risksConstraints,
        remarks: body.remarks !== undefined ? body.remarks : plan.remarks,
        updatedAt: now().toISOString(),
      });
      return clone(plan);
    },

    submitTestPlan(id, body = {}, actor) {
      const plan = testPlans.get(id);
      if (!plan) fail(404, "Test Plan not found", "NOT_FOUND");
      if (plan.status !== "Draft") fail(400, "Only Draft plans can be submitted", "INVALID_STATE");
      plan.status = "Submitted";
      plan.submittedAt = now().toISOString();
      plan.submissionNotes = body.notes || "";
      plan.updatedAt = now().toISOString();
      return clone(plan);
    },

    approveTestPlan(id, body = {}, actor) {
      const plan = testPlans.get(id);
      if (!plan) fail(404, "Test Plan not found", "NOT_FOUND");
      if (plan.status !== "Submitted" && plan.status !== "Draft") {
        fail(400, "Only Submitted or Draft plans can be approved", "INVALID_STATE");
      }
      plan.status = "Ready for Execution";
      plan.approvedAt = now().toISOString();
      plan.approvedBy = actor?.userId || "user-approver";
      plan.approvalNotes = body.notes || "Approved for execution.";
      plan.updatedAt = now().toISOString();
      return clone(plan);
    },

    rejectTestPlan(id, body = {}, actor) {
      const plan = testPlans.get(id);
      if (!plan) fail(404, "Test Plan not found", "NOT_FOUND");
      plan.status = "Draft";
      plan.rejectedAt = now().toISOString();
      plan.rejectionReason = body.notes || body.reason || "Revisions required.";
      plan.updatedAt = now().toISOString();
      return clone(plan);
    },

    // --- ITDR Test Execution / Results API ---
    listTestResults(filter = {}) {
      return [...testResults.values()]
        .filter((r) => {
          if (filter.testPlanId && r.testPlanId !== filter.testPlanId) return false;
          if (filter.overallResult && r.overallResult !== filter.overallResult) return false;
          return true;
        })
        .map(clone)
        .sort((a, b) => String(b.recordedAt || b.actualTestDate).localeCompare(String(a.recordedAt || a.actualTestDate)));
    },

    getTestResult(id) {
      const result = testResults.get(id);
      if (!result) fail(404, "Test Result not found", "NOT_FOUND");
      return clone(result);
    },

    recordTestResult(body, actor) {
      if (createBlocked) fail(503, "Testing module unavailable", "TESTING_DOWN");
      if (!body.testPlanId) fail(400, "testPlanId is required to link test execution", "MISSING_TEST_PLAN");
      const plan = testPlans.get(body.testPlanId);
      if (!plan) fail(404, "Linked Test Plan not found", "NOT_FOUND");

      const resultId = body.resultId || `TR-${new Date().getFullYear()}-${String(testResults.size + 1).padStart(3, "0")}`;
      
      const actualRecoveryTimeMinutes = body.actualRecoveryTimeMinutes != null ? Number(body.actualRecoveryTimeMinutes) : null;
      const actualRpoAchievedMinutes = body.actualRpoAchievedMinutes != null ? Number(body.actualRpoAchievedMinutes) : null;
      
      const stepResults = (body.stepResults || []).map((s, idx) => {
        const plannedStep = (plan.steps || []).find((ps) => ps.stepNumber === s.stepNumber) || plan.steps?.[idx];
        return {
          stepNumber: s.stepNumber ?? idx + 1,
          stepTitle: s.stepTitle || plannedStep?.title || `Step ${idx + 1}`,
          procedure: s.procedure || plannedStep?.procedure || "",
          expectedResult: s.expectedResult || plannedStep?.expectedResult || "",
          actualResult: s.actualResult || "",
          stepStatus: s.stepStatus || "Passed", // Passed | Failed | Not Executed | Not Applicable
          durationMinutes: s.durationMinutes != null ? Number(s.durationMinutes) : null,
          executionNotes: s.executionNotes || "",
        };
      });

      const result = {
        resultId,
        testPlanId: plan.testPlanId,
        applicationName: plan.applicationName,
        targetBiaApplicationId: plan.targetBiaApplicationId,
        actualTestDate: body.actualTestDate || now().toISOString().slice(0, 10),
        actualStartTime: body.actualStartTime || "02:00",
        actualEndTime: body.actualEndTime || "05:00",
        actualRecoveryTimeMinutes,
        actualRpoAchievedMinutes,
        overallResult: body.overallResult || "Passed", // Passed | Passed with Observations | Failed
        stepResults,
        evidenceAttachments: body.evidenceAttachments || body.evidenceRef || "",
        issuesObservations: body.issuesObservations || "",
        deviationFromPlan: body.deviationFromPlan || "",
        rootCause: body.rootCause || "",
        correctiveActions: (body.correctiveActions || []).map((act, i) => ({
          actionId: act.actionId || `ACT-${String(i + 1).padStart(3, "0")}`,
          actionDescription: act.actionDescription || act.description || "",
          actionOwner: act.actionOwner || act.owner || "",
          targetClosureDate: act.targetClosureDate || act.dueDate || "",
          actionStatus: act.actionStatus || "Open", // Open | In Progress | Closed
        })),
        remarks: body.remarks || "",
        recordedBy: actor?.displayName || actor?.userId || "Test Manager",
        recordedAt: now().toISOString(),
      };

      testResults.set(resultId, result);

      // Update plan status to Executed
      plan.status = "Executed";
      plan.lastResultId = resultId;
      plan.updatedAt = now().toISOString();

      return clone(result);
    },

    // --- Expected vs Actual Comparison API ---
    getComparison(testPlanId) {
      const plan = testPlans.get(testPlanId);
      if (!plan) fail(404, "Test Plan not found", "NOT_FOUND");
      
      const results = [...testResults.values()].filter((r) => r.testPlanId === testPlanId);
      const latestResult = results.sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt)))[0] || null;

      const rtoTarget = plan.targetRtoMinutes;
      const rtoActual = latestResult?.actualRecoveryTimeMinutes ?? null;
      const rtoStatus = rtoActual != null && rtoTarget != null 
        ? (rtoActual <= rtoTarget ? "Met" : "Breached")
        : (latestResult ? "Uncalculated" : "Pending Execution");

      const rpoTarget = plan.targetRpoMinutes;
      const rpoActual = latestResult?.actualRpoAchievedMinutes ?? null;
      const rpoStatus = rpoActual != null && rpoTarget != null 
        ? (rpoActual <= rpoTarget ? "Met" : "Breached")
        : (latestResult ? "Uncalculated" : "Pending Execution");

      // Compare Step by Step
      const stepComparisons = (plan.steps || []).map((plannedStep) => {
        const actualStep = latestResult?.stepResults?.find((s) => s.stepNumber === plannedStep.stepNumber);
        return {
          stepNumber: plannedStep.stepNumber,
          stepTitle: plannedStep.title,
          procedure: plannedStep.procedure,
          assigneeRole: plannedStep.assigneeRole,
          expectedResult: plannedStep.expectedResult,
          actualResult: actualStep?.actualResult || (latestResult ? "Not recorded" : "Pending Execution"),
          stepStatus: actualStep?.stepStatus || (latestResult ? "Not Executed" : "Pending"),
          durationMinutes: actualStep?.durationMinutes ?? null,
          executionNotes: actualStep?.executionNotes || "",
        };
      });

      const totalSteps = stepComparisons.length;
      const passedSteps = stepComparisons.filter((s) => s.stepStatus === "Passed").length;
      const failedSteps = stepComparisons.filter((s) => s.stepStatus === "Failed").length;
      const stepPassRate = totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 0;

      return {
        testPlan: clone(plan),
        testResult: clone(latestResult),
        summary: {
          rto: {
            plannedMinutes: rtoTarget,
            actualMinutes: rtoActual,
            varianceMinutes: rtoActual != null && rtoTarget != null ? rtoActual - rtoTarget : null,
            status: rtoStatus,
          },
          rpo: {
            plannedMinutes: rpoTarget,
            actualMinutes: rpoActual,
            varianceMinutes: rpoActual != null && rpoTarget != null ? rpoActual - rpoTarget : null,
            status: rpoStatus,
          },
          stepStats: {
            total: totalSteps,
            passed: passedSteps,
            failed: failedSteps,
            passRatePercent: stepPassRate,
          },
          overallResult: latestResult?.overallResult || "Pending Execution",
        },
        stepComparisons,
        correctiveActions: latestResult?.correctiveActions || [],
        issuesObservations: latestResult?.issuesObservations || "",
        deviationFromPlan: latestResult?.deviationFromPlan || "",
        rootCause: latestResult?.rootCause || "",
      };
    },

    // --- Legacy / Compatibility API ---
    requestDrTest(req) {
      if (createBlocked) fail(503, "Testing module unavailable", "TESTING_DOWN");
      if (!req.planVersionId) fail(400, "planVersionId required to bind a DR Test", "EC-TST-01");
      const existing = listOpenForVersion(req.planVersionId);
      if (existing) return { ...clone(existing), reused: true };
      const test = {
        testId: newId("tst"),
        testType: DR_TEST,
        planVersionId: req.planVersionId,
        targetBiaApplicationId: req.targetBiaApplicationId,
        ownerUserId: req.ownerUserId || null,
        status: "open",
        requestedAt: now().toISOString(),
        dueAt: req.dueAt || null,
        scheduledAt: null,
        completedAt: null,
        outcome: null,
        testerUserId: null,
        evidenceRef: null,
        targetRtoMinutes: req.targetRtoMinutes ?? null,
        targetRpoMinutes: req.targetRpoMinutes ?? null,
        actualRtoMinutes: null,
        actualRpoMinutes: null,
        exerciseMode: null,
        stepResults: [],
        participants: [],
        gapsIssues: "",
        questionnaire: null,
        remediationRequired: false,
        retestDueAt: null,
        resultId: null,
        schedulerOfRecord: "Testing",
        cycleMonths: recertificationMonths(req.tier),
      };
      tests.set(test.testId, test);
      return { ...clone(test), reused: false };
    },

    schedule({ testType = DR_TEST, planVersionId, targetBiaApplicationId, ownerUserId, scheduledAt, dueAt, targetRtoMinutes, targetRpoMinutes, participants, exerciseMode }) {
      if (testType === DR_TEST && planVersionId) {
        const open = listOpenForVersion(planVersionId);
        if (open) {
          open.scheduledAt = scheduledAt || now().toISOString();
          if (dueAt) open.dueAt = dueAt;
          if (ownerUserId) open.ownerUserId = ownerUserId;
          if (exerciseMode) open.exerciseMode = exerciseMode;
          if (targetRtoMinutes != null) open.targetRtoMinutes = targetRtoMinutes;
          if (targetRpoMinutes != null) open.targetRpoMinutes = targetRpoMinutes;
          if (targetBiaApplicationId) open.targetBiaApplicationId = targetBiaApplicationId;
          if (participants) open.participants = participants;
          open.status = "in_progress";
          return clone(open);
        }
      }
      const test = {
        testId: newId("tst"),
        testType,
        planVersionId: planVersionId || null,
        targetBiaApplicationId: targetBiaApplicationId || null,
        ownerUserId: ownerUserId || null,
        status: scheduledAt ? "in_progress" : "open",
        requestedAt: now().toISOString(),
        dueAt: dueAt || null,
        scheduledAt: scheduledAt || now().toISOString(),
        completedAt: null,
        outcome: null,
        testerUserId: null,
        evidenceRef: null,
        targetRtoMinutes: targetRtoMinutes ?? null,
        targetRpoMinutes: targetRpoMinutes ?? null,
        actualRtoMinutes: null,
        actualRpoMinutes: null,
        exerciseMode: exerciseMode || null,
        stepResults: [],
        participants: participants || [],
        gapsIssues: "",
        questionnaire: null,
        remediationRequired: false,
        retestDueAt: null,
        resultId: null,
        schedulerOfRecord: "Testing",
      };
      tests.set(test.testId, test);
      return clone(test);
    },

    complete(testId, body, actor) {
      const test = tests.get(testId);
      if (!test) fail(404, "Test not found", "NOT_FOUND");
      if (body.resultId && test.resultId === body.resultId) return clone(test);
      test.status = "completed";
      test.completedAt = body.completedAt || now().toISOString();
      test.testerUserId = body.testerUserId || actor?.userId || null;
      test.evidenceRef = body.evidenceRef || null;
      test.exerciseMode = body.exerciseMode || test.exerciseMode;
      if (body.questionnaire) test.questionnaire = body.questionnaire;
      const answers = test.questionnaire?.answers;
      const derived = answers ? deriveTestOutcome(test.exerciseMode, answers) : "pending";
      if (derived && derived !== "pending") test.outcome = derived;
      else if (body.outcome) test.outcome = body.outcome;
      const tabletop = test.exerciseMode === "tabletop";
      if (tabletop && body.actualRtoMinutes == null && body.actualRpoMinutes == null) {
        test.actualRtoMinutes = null;
        test.actualRpoMinutes = null;
      } else {
        test.actualRtoMinutes = body.actualRtoMinutes ?? test.actualRtoMinutes;
        test.actualRpoMinutes = body.actualRpoMinutes ?? test.actualRpoMinutes;
      }
      if (body.targetRtoMinutes != null) test.targetRtoMinutes = body.targetRtoMinutes;
      if (body.targetRpoMinutes != null) test.targetRpoMinutes = body.targetRpoMinutes;
      test.stepResults = body.stepResults || test.stepResults || [];
      if (body.participants) test.participants = body.participants;
      if (body.gapsIssues != null) test.gapsIssues = body.gapsIssues;
      test.remediationRequired =
        body.remediationRequired != null
          ? Boolean(body.remediationRequired)
          : test.outcome === "fail" || test.outcome === "partial";
      if (body.retestDueAt) test.retestDueAt = body.retestDueAt;
      else if (test.remediationRequired && !test.retestDueAt) {
        test.retestDueAt = addMonths(now(), test.cycleMonths || recertificationMonths()).toISOString();
      }
      test.resultId = body.resultId || test.resultId || newId("res");
      if (body.planVersionId != null) test.planVersionId = body.planVersionId;
      return clone(test);
    },

    get(id) {
      const test = tests.get(id);
      if (!test) fail(404, "Test not found", "NOT_FOUND");
      return clone(test);
    },

    list(filter = {}) {
      return [...tests.values()]
        .filter((t) => {
          if (filter.targetBiaApplicationId && t.targetBiaApplicationId !== filter.targetBiaApplicationId) return false;
          if (filter.planVersionId && t.planVersionId !== filter.planVersionId) return false;
          if (filter.testType && t.testType !== filter.testType) return false;
          return true;
        })
        .map(clone)
        .sort((a, b) => String(b.completedAt || b.requestedAt).localeCompare(String(a.completedAt || a.requestedAt)));
    },

    _tests: tests,
    _testPlans: testPlans,
    _testResults: testResults,
  };
}
