import { assertCrisisCompatible, mostDemandingObjectives } from "./contracts.mjs";
import { decisions, recertificationMonths } from "./decisions.mjs";
import { createBiaCatalog } from "./biaCatalog.mjs";
import { clone, fail, addMonths, newId } from "./httpError.mjs";
import { Roles } from "./platform.mjs";
import { computeReadiness, mappingKeyFromProcesses } from "./readiness.mjs";
import { STRATEGIES, listTemplates, templateForTier } from "./templates.mjs";
import { DR_TEST, EXERCISE_MODES, createTestingModule } from "./testingModule.mjs";
import {
  APPLICATION_TYPES,
  HOSTING_ENVIRONMENTS,
  LIFECYCLE_STATUSES,
  BACKUP_FREQUENCIES,
  RETENTION_UNITS,
  FAILOVER_METHODS,
  ASSET_TYPES,
  fieldCatalogs,
} from "./catalogs.mjs";
const SECRET_HINT = /(password|secret|api[_-]?key|private[_-]?key)/i;

export const DIRECTORY = Object.freeze([
  { userId: "user-admin", displayName: "Jordan Admin", role: Roles.ADMIN },
  { userId: "user-plan_owner", displayName: "Alex Owner", role: Roles.PLAN_OWNER },
  { userId: "user-approver", displayName: "Riley Approver", role: Roles.APPROVER },
  { userId: "user-auditor", displayName: "Casey Auditor", role: Roles.AUDITOR },
  { userId: "user-executive", displayName: "Morgan Executive", role: Roles.EXECUTIVE },
  { userId: "user-test_manager", displayName: "Taylor Test Manager", role: Roles.TEST_MANAGER },
]);

function hasCycle(assetIds, edges) {
  const incoming = Object.fromEntries(assetIds.map((id) => [id, 0]));
  const adj = Object.fromEntries(assetIds.map((id) => [id, []]));
  for (const e of edges) {
    if (!adj[e.fromAssetId] || incoming[e.toAssetId] == null) continue;
    adj[e.fromAssetId].push(e.toAssetId);
    incoming[e.toAssetId] += 1;
  }
  const queue = assetIds.filter((id) => incoming[id] === 0);
  let seen = 0;
  while (queue.length) {
    const id = queue.shift();
    seen += 1;
    for (const next of adj[id]) {
      incoming[next] -= 1;
      if (incoming[next] === 0) queue.push(next);
    }
  }
  return seen !== assetIds.length;
}

export function createItdrModule({ audit, notifications, testing, now = () => new Date() } = {}) {
  const bia = createBiaCatalog();
  const targets = new Map();
  const plans = new Map();
  const versions = new Map();
  const testingModule = testing || createTestingModule({ now });
  const testOutbox = [];
  const reminderKeys = new Set();
  const ingestedResults = new Set();
  const cmdbOrphans = [];
  let cmdbLastSyncAt = null;

  function record(actor, action, detail) {
    audit?.record({
      actor: actor?.userId,
      role: actor?.role,
      tenantId: actor?.tenantId,
      action,
      detail,
    });
  }

  function notify(type, payload, actor) {
    notifications?.publish(type, payload, actor?.userId);
  }

  function testsFor(target) {
    return testingModule.list({ targetBiaApplicationId: target.biaApplicationId });
  }

  function requestTestForVersion(target, version, reason) {
    const dueAt = addMonths(new Date(version.approvedAt || now()), recertificationMonths(target.tier)).toISOString();
    const payload = {
      planVersionId: version.versionId,
      targetBiaApplicationId: target.biaApplicationId,
      ownerUserId: target.primaryOwnerUserId,
      tier: target.tier,
      dueAt,
      targetRtoMinutes: version.claimedRtoMinutes,
      targetRpoMinutes: version.claimedRpoMinutes,
      reason,
    };
    try {
      const created = testingModule.requestDrTest(payload);
      record({ userId: "system", role: "SYSTEM", tenantId: target.tenantId }, "testing.request", {
        versionId: version.versionId,
        testId: created.testId,
        reused: created.reused,
        reason,
      });
      return { ok: true, ...created };
    } catch (err) {
      testOutbox.push({ ...payload, lastError: err.message, at: now().toISOString() });
      record({ userId: "system", role: "SYSTEM", tenantId: target.tenantId }, "testing.request.queued", {
        versionId: version.versionId,
        error: err.message,
      });
      return { ok: false, queued: true, error: err.message };
    }
  }

  function liveBia(id) {
    try {
      return bia.get(id);
    } catch (err) {
      if (err.code === "BIA_UNAVAILABLE") return bia.getIncludingOutOfScope(id);
      throw err;
    }
  }

  function targetOrThrow(id) {
    const target = targets.get(id);
    if (!target) fail(404, "Recovery target not found", "NOT_FOUND");
    return target;
  }

  function versionsFor(planId) {
    return [...versions.values()].filter((v) => v.planId === planId);
  }

  function currentApproved(target) {
    if (!target.currentApprovedVersionId) return null;
    return versions.get(target.currentApprovedVersionId) || null;
  }

  function currentDraft(target) {
    if (!target.planId) return null;
    return versionsFor(target.planId).find((v) => v.status === "draft" || v.status === "in_review") || null;
  }

  function isOwner(target, userId) {
    return target.primaryOwnerUserId === userId || target.backupOwnerUserId === userId;
  }

  function canView(session, target) {
    if ([Roles.ADMIN, Roles.AUDITOR, Roles.APPROVER, Roles.EXECUTIVE].includes(session.role)) return true;
    if (session.role === Roles.PLAN_OWNER) return isOwner(target, session.userId);
    return false;
  }

  function canEdit(session, target) {
    if (session.role === Roles.ADMIN) return true;
    if (session.role === Roles.PLAN_OWNER) return isOwner(target, session.userId);
    return false;
  }

  function canManage(session) {
    return session.role === Roles.ADMIN;
  }

  function assertView(session, target) {
    if (!canView(session, target)) fail(403, "Forbidden: not assigned to this target", "FORBIDDEN");
  }

  function assertEdit(session, target) {
    if (!canEdit(session, target)) fail(403, "Forbidden: cannot edit this target", "FORBIDDEN");
  }

  function seedTarget(app) {
    const existing = targets.get(app.biaApplicationId);
    if (existing) {
      existing.name = app.name;
      existing.tier = app.tier;
      existing.outOfBiaScope = app.inScope === false;
      return existing;
    }
    const assetId = `asset-${app.biaApplicationId}`;
    const target = {
      targetId: app.biaApplicationId,
      biaApplicationId: app.biaApplicationId,
      tenantId: app.tenantId,
      name: app.name,
      tier: app.tier,
      applicationOwnerUserId: "user-plan_owner",
      applicationType: app.tier === 1 ? "custom_built" : app.tier === 2 ? "cots" : "legacy",
      hostingEnvironment: app.biaApplicationId === "bia-app-payments" ? "aws" : app.biaApplicationId === "bia-app-hr" ? "vendor_hosted" : "on_prem",
      vendorDependencies: "",
      lifecycleStatus: "active",
      strategy: null,
      primarySite: "",
      recoverySite: "",
      backupFrequency: null,
      backupRetentionValue: null,
      backupRetentionUnit: "days",
      failoverMethod: null,
      primaryOwnerUserId: null,
      backupOwnerUserId: null,
      assignmentAcknowledgedAt: null,
      assignmentAcknowledgedBy: null,
      rtoOverrideMinutes: null,
      rpoOverrideMinutes: null,
      overrideReason: null,
      overrideBy: null,
      overrideAt: null,
      assets: [
        {
          assetId,
          name: app.name,
          type: "application",
          environment: "prod",
          ownerUserId: null,
          criticality: "high",
          source: "native",
          recoveryNotes: null,
        },
      ],
      dependencies: [],
      planId: null,
      currentApprovedVersionId: null,
      retired: false,
      outOfBiaScope: app.inScope === false,
    };
    targets.set(app.biaApplicationId, target);
    return target;
  }

  function syncFromBia(session) {
    const apps = bia.list(session.tenantId);
    const inScope = new Set(apps.map((a) => a.biaApplicationId));
    for (const app of apps) seedTarget(app);
    for (const target of targets.values()) {
      if (target.tenantId !== session.tenantId) continue;
      if (!inScope.has(target.biaApplicationId)) target.outOfBiaScope = true;
      else target.outOfBiaScope = false;
    }
    return coverage(session);
  }

  function effectiveObjectives(target, live) {
    const inherited = live?.inheritedObjectives || mostDemandingObjectives(live?.processes || []);
    return {
      inherited,
      effectiveRtoMinutes: target.rtoOverrideMinutes ?? inherited.rtoMinutes,
      effectiveRpoMinutes: target.rpoOverrideMinutes ?? inherited.rpoMinutes,
    };
  }

  function planListStatus(row) {
    const s = row.readiness?.status;
    const draft = row.draft?.status;
    if (s === "expired") return "expired";
    if (s === "failed_test") return "under_remediation";
    if (draft === "in_review") return "in_review";
    if (s === "ready") return "published";
    if (row.currentApprovedVersionId) return "approved";
    if (draft === "draft") return "draft";
    return "none";
  }

  function decorate(session, target) {
    const live = liveBia(target.biaApplicationId);
    const approved = currentApproved(target);
    const draft = currentDraft(target);
    const readiness = computeReadiness({
      target,
      draftVersion: draft,
      approvedVersion: approved,
      liveBia: live,
      now: now(),
      tests: testsFor(target),
    });
    const bcp = bia.listBcp(target.biaApplicationId);
    return {
      ...clone(target),
      bcpPlans: bcp.map((p) => ({ planId: p.planId, title: p.title, status: p.status })),
      processes: live?.processes || [],
      biaGap: !live || (live.inheritedObjectives.rtoMinutes == null && live.inheritedObjectives.rpoMinutes == null),
      lastBiaReadAt: bia.lastReadAt(),
      objectives: effectiveObjectives(target, live),
      graphHasCycle: hasCycle(
        target.assets.map((a) => a.assetId),
        target.dependencies
      ),
      draft,
      approved,
      tests: testsFor(target),
      readiness,
    };
  }

  function coverage(session) {
    syncMissing(session);
    const rows = [...targets.values()]
      .filter((t) => t.tenantId === session.tenantId)
      .map((t) => {
        const row = decorate(session, t);
        if (session.role === Roles.PLAN_OWNER && !canView(session, t)) {
          return {
            targetId: t.targetId,
            biaApplicationId: t.biaApplicationId,
            name: t.name,
            tier: t.tier,
            outOfBiaScope: t.outOfBiaScope,
            retired: t.retired,
            readiness: { status: row.readiness.status, kpiEligible: row.readiness.kpiEligible, inCoverageDenominator: row.readiness.inCoverageDenominator },
            redacted: true,
          };
        }
        const completed = (row.tests || [])
          .filter((x) => x.completedAt)
          .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
        return {
          targetId: row.targetId,
          biaApplicationId: row.biaApplicationId,
          name: row.name,
          tier: row.tier,
          outOfBiaScope: row.outOfBiaScope,
          retired: row.retired,
          primaryOwnerUserId: row.primaryOwnerUserId,
          backupOwnerUserId: row.backupOwnerUserId,
          applicationOwnerUserId: row.applicationOwnerUserId,
          applicationType: row.applicationType,
          hostingEnvironment: row.hostingEnvironment,
          vendorDependencies: row.vendorDependencies,
          lifecycleStatus: row.lifecycleStatus,
          strategy: row.strategy,
          primarySite: row.primarySite,
          recoverySite: row.recoverySite,
          backupFrequency: row.backupFrequency,
          backupRetentionValue: row.backupRetentionValue,
          backupRetentionUnit: row.backupRetentionUnit,
          failoverMethod: row.failoverMethod,
          currentApprovedVersionId: row.currentApprovedVersionId,
          draftStatus: row.draft?.status || null,
          objectives: row.objectives,
          readiness: row.readiness,
          evidence: row.readiness.evidence,
          lastTestedAt: completed[0]?.completedAt || row.readiness.evidence?.testCompletedAt || null,
          testCount: completed.length,
          versionCount: [...versions.values()].filter((v) => v.planId === t.planId).length,
          planStatus: planListStatus(row),
          bcpPlanIds: row.bcpPlans.map((p) => p.planId),
        };
      });

    const scoped = rows.filter((r) => r.readiness?.inCoverageDenominator !== false && !r.outOfBiaScope && !r.retired);
    const tier12 = scoped.filter((r) => r.tier === 1 || r.tier === 2);
    const approvedNonExpired = tier12.filter((r) => r.readiness?.kpiEligible).length;
    return {
      generatedAt: now().toISOString(),
      kpi: {
        population: "tier_1_2_in_bia_scope",
        denominator: tier12.length,
        approvedNonExpired,
        percent: tier12.length ? Math.round((approvedNonExpired / tier12.length) * 1000) / 10 : null,
      },
      countsByStatus: scoped.reduce((acc, r) => {
        const s = r.readiness.status;
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {}),
      rows,
    };
  }

  function syncMissing(session) {
    let apps;
    try {
      apps = bia.list(session.tenantId);
    } catch (err) {
      if (err.code === "BIA_UNAVAILABLE") {
        apps = bia.listCached(session.tenantId).filter((a) => a.inScope);
      } else throw err;
    }
    for (const app of apps) {
      if (!targets.has(app.biaApplicationId)) seedTarget(app);
    }
  }

  function patchTarget(session, id, body) {
    if (body.ready != null || body.readiness != null || body.status === "ready") {
      fail(403, "Readiness is derived and not writable", "EC-APR-17");
    }
    const target = targetOrThrow(id);
    assertEdit(session, target);
    if (body.strategy != null) {
      if (body.strategy && !STRATEGIES.includes(body.strategy)) fail(400, "Unknown recovery strategy", "FR-5");
      target.strategy = body.strategy || null;
    }
    if (body.applicationType != null) {
      if (body.applicationType && !APPLICATION_TYPES.includes(body.applicationType)) fail(400, "Unknown application type", "FR-1");
      target.applicationType = body.applicationType || null;
    }
    if (body.hostingEnvironment != null) {
      if (body.hostingEnvironment && !HOSTING_ENVIRONMENTS.includes(body.hostingEnvironment)) fail(400, "Unknown hosting environment", "FR-1");
      target.hostingEnvironment = body.hostingEnvironment || null;
    }
    if (body.lifecycleStatus != null) {
      if (body.lifecycleStatus && !LIFECYCLE_STATUSES.includes(body.lifecycleStatus)) fail(400, "Unknown application status", "FR-1");
      target.lifecycleStatus = body.lifecycleStatus;
    }
    if (body.vendorDependencies != null) target.vendorDependencies = body.vendorDependencies;
    if (body.primarySite != null) target.primarySite = body.primarySite;
    if (body.recoverySite != null) target.recoverySite = body.recoverySite;
    if (body.backupFrequency != null) {
      if (body.backupFrequency && !BACKUP_FREQUENCIES.includes(body.backupFrequency)) fail(400, "Unknown backup frequency", "FR-5");
      target.backupFrequency = body.backupFrequency || null;
    }
    if (body.backupRetentionValue != null) target.backupRetentionValue = body.backupRetentionValue === "" ? null : Number(body.backupRetentionValue);
    if (body.backupRetentionUnit != null) {
      if (body.backupRetentionUnit && !RETENTION_UNITS.includes(body.backupRetentionUnit)) fail(400, "Unknown retention unit", "FR-5");
      target.backupRetentionUnit = body.backupRetentionUnit || "days";
    }
    if (body.failoverMethod != null) {
      if (body.failoverMethod && !FAILOVER_METHODS.includes(body.failoverMethod)) fail(400, "Unknown failover method", "FR-5");
      target.failoverMethod = body.failoverMethod || null;
    }
    if (canManage(session) && body.applicationOwnerUserId != null) {
      target.applicationOwnerUserId = body.applicationOwnerUserId || null;
    }
    if (canManage(session) && (body.primaryOwnerUserId != null || body.backupOwnerUserId != null)) {
      const primary = body.primaryOwnerUserId ?? target.primaryOwnerUserId;
      const backup = body.backupOwnerUserId ?? target.backupOwnerUserId;
      if (primary && backup && primary === backup) fail(400, "Primary and backup owners must differ", "EC-APR-11");
      const changed = primary !== target.primaryOwnerUserId;
      target.primaryOwnerUserId = primary || null;
      target.backupOwnerUserId = backup || null;
      if (changed && primary) {
        target.assignmentAcknowledgedAt = null;
        target.assignmentAcknowledgedBy = null;
        notify("plan.assigned", { biaApplicationId: id, primaryOwnerUserId: primary }, session);
      }
    }
    if (body.rtoOverrideMinutes != null || body.rpoOverrideMinutes != null || body.clearOverride) {
      if (body.clearOverride) {
        record(session, "rto.override.clear", { id, before: { rto: target.rtoOverrideMinutes, rpo: target.rpoOverrideMinutes } });
        target.rtoOverrideMinutes = null;
        target.rpoOverrideMinutes = null;
        target.overrideReason = null;
        target.overrideBy = null;
        target.overrideAt = null;
      } else {
        if (!body.overrideReason) fail(400, "Override requires a justification", "FR-4");
        const before = { rto: target.rtoOverrideMinutes, rpo: target.rpoOverrideMinutes };
        if (body.rtoOverrideMinutes != null) target.rtoOverrideMinutes = Number(body.rtoOverrideMinutes);
        if (body.rpoOverrideMinutes != null) target.rpoOverrideMinutes = Number(body.rpoOverrideMinutes);
        target.overrideReason = body.overrideReason;
        target.overrideBy = session.userId;
        target.overrideAt = now().toISOString();
        record(session, "rto.override", { id, before, after: { rto: target.rtoOverrideMinutes, rpo: target.rpoOverrideMinutes }, reason: body.overrideReason });
      }
    }
    record(session, "target.patch", { id });
    return decorate(session, target);
  }

  function ack(session, id) {
    const target = targetOrThrow(id);
    if (!isOwner(target, session.userId) && session.role !== Roles.ADMIN) {
      fail(403, "Only the assigned owner can acknowledge", "FR-13");
    }
    target.assignmentAcknowledgedAt = now().toISOString();
    target.assignmentAcknowledgedBy = session.userId;
    record(session, "plan.assigned.ack", { id });
    return decorate(session, target);
  }

  function addAsset(session, id, body) {
    const target = targetOrThrow(id);
    assertEdit(session, target);
    if (body.lifecycle && ["procure", "fleet_retire"].includes(body.lifecycle)) {
      fail(400, "ITDR does not manage general CMDB lifecycle", "EC-AST-04");
    }
    if (body.type && !ASSET_TYPES.includes(body.type)) fail(400, "Unknown asset type", "FR-1");
    const asset = {
      assetId: body.assetId || newId("asset"),
      name: body.name || "untitled",
      type: body.type || "infrastructure",
      environment: body.environment || "prod",
      ownerUserId: body.ownerUserId || null,
      criticality: body.criticality || "medium",
      source: "native",
      recoveryNotes: body.recoveryNotes || null,
    };
    if (target.assets.some((a) => a.assetId === asset.assetId)) fail(409, "Asset already on this target", "FR-1");
    target.assets.push(asset);
    record(session, "asset.add", { id, assetId: asset.assetId });
    return decorate(session, target);
  }

  function removeAsset(session, id, assetId) {
    const target = targetOrThrow(id);
    assertEdit(session, target);
    const approved = currentApproved(target);
    target.assets = target.assets.filter((a) => a.assetId !== assetId);
    target.dependencies = target.dependencies.filter((d) => d.fromAssetId !== assetId && d.toAssetId !== assetId);
    record(session, "asset.remove", {
      id,
      assetId,
      retainedOnApprovedSnapshot: Boolean(approved?.snapshot?.assets?.some((a) => a.assetId === assetId)),
    });
    return decorate(session, target);
  }

  function addDependency(session, id, body) {
    const target = targetOrThrow(id);
    assertEdit(session, target);
    const edge = {
      fromAssetId: body.fromAssetId,
      toAssetId: body.toAssetId,
      type: body.type || "depends_on",
    };
    if (!edge.fromAssetId || !edge.toAssetId) fail(400, "fromAssetId and toAssetId required", "FR-2");
    const next = [...target.dependencies, edge];
    if (hasCycle(target.assets.map((a) => a.assetId), next)) {
      fail(400, "Dependency cycle is not allowed", "EC-AST-01");
    }
    target.dependencies.push(edge);
    record(session, "dependency.add", { id, edge });
    return decorate(session, target);
  }

  function crisisPayload(target, version) {
    const assetId = target.assets.find((a) => a.type === "application")?.assetId || null;
    const payload = {
      planId: target.planId,
      planType: "DR",
      versionId: version.versionId,
      title: version.title,
      ownerUserId: target.primaryOwnerUserId,
      status: version.status,
      links: (target.processesSnapshot || version.snapshot?.links || []).length
        ? version.snapshot?.links
        : (liveBia(target.biaApplicationId)?.processes || []).map((p) => ({
            processId: p.processId,
            assetId,
            applicationId: target.biaApplicationId,
          })),
      target: { biaApplicationId: target.biaApplicationId, name: target.name },
      roles: version.roles,
      steps: version.steps.map((s) => ({ stepId: s.stepId, order: s.order, instruction: s.instruction })),
    };
    if (!payload.links) {
      payload.links = (liveBia(target.biaApplicationId)?.processes || []).map((p) => ({
        processId: p.processId,
        assetId,
        applicationId: target.biaApplicationId,
      }));
    }
    assertCrisisCompatible(payload);
    return payload;
  }

  function createDraft(session, id, body = {}) {
    const target = targetOrThrow(id);
    assertEdit(session, target);
    if (target.retired) fail(400, "Retired target cannot gain a new plan without Admin restore", "EC-APR-09");
    const existing = currentDraft(target);
    if (existing) fail(409, "A draft or in-review version already exists", "EC-TGT-02");
    const hasUserSteps = Array.isArray(body.steps) && body.steps.some((s) => String(s.title || s.instruction || "").trim());
    const applyTemplate = body.applyTemplate !== false && !hasUserSteps;
    const tpl = applyTemplate ? templateForTier(target.tier) : templateForTier(null);
    const live = liveBia(target.biaApplicationId);
    const obj = effectiveObjectives(target, live);
    if (!target.planId) target.planId = `dr-${target.biaApplicationId}`;
    const stepSource = hasUserSteps ? body.steps : tpl.steps;
    const contactSource = Array.isArray(body.contacts) && body.contacts.some((c) => String(c.name || "").trim())
      ? body.contacts
      : tpl.contacts;
    const version = {
      versionId: newId("ver"),
      planId: target.planId,
      status: "draft",
      title: body.title || `${target.name} technical recovery`,
      etag: 1,
      strategy: body.strategy || target.strategy || tpl.strategy,
      claimedRtoMinutes: body.claimedRtoMinutes != null ? Number(body.claimedRtoMinutes) : obj.effectiveRtoMinutes,
      claimedRpoMinutes: body.claimedRpoMinutes != null ? Number(body.claimedRpoMinutes) : obj.effectiveRpoMinutes,
      steps: stepSource.map((s, i) => ({
        stepId: s.stepId || newId("s"),
        order: s.order ?? i + 1,
        title: s.title || `Step ${s.order ?? i + 1}`,
        instruction: s.instruction || "",
        ownerRole: s.ownerRole || "",
        prerequisite: s.prerequisite || "",
        estimatedDurationMinutes: s.estimatedDurationMinutes == null || s.estimatedDurationMinutes === "" ? null : Number(s.estimatedDurationMinutes),
        rollback: s.rollback || "",
        verification: s.verification || "",
      })),
      contacts: contactSource.map((c) => ({
        role: c.role || "",
        name: c.name || "",
        email: c.email || "",
        phone: c.phone || "",
        contactType: c.contactType || "primary",
        escalationOrder: c.escalationOrder == null || c.escalationOrder === "" ? null : Number(c.escalationOrder),
      })),
      templateId: body.templateId || tpl.id,
      lastReviewedAt: null,
      nextReviewDueAt: null,
      attachments: [],
      roles: [
        { role: "plan_owner", userId: target.primaryOwnerUserId, displayName: "Plan Owner" },
        { role: "backup_owner", userId: target.backupOwnerUserId, displayName: "Backup Plan Owner" },
      ],
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      reviewComments: [],
      snapshot: null,
      createdAt: now().toISOString(),
      updatedAt: now().toISOString(),
    };
    if (Array.isArray(body.attachmentsAdd)) {
      for (const att of body.attachmentsAdd) {
        const name = att.fileName || "";
        if (/\.(exe|bat|cmd|sh)$/i.test(name)) fail(400, "Disallowed attachment type", "EC-PLN-05");
        version.attachments.push({
          id: newId("att"),
          fileName: name || "untitled",
          kind: att.kind || "other",
          note: att.note || "",
        });
      }
    }
    if (body.strategy && STRATEGIES.includes(body.strategy)) {
      version.strategy = body.strategy;
      if (!target.strategy) target.strategy = body.strategy;
    }
    if (!target.strategy) target.strategy = version.strategy;
    versions.set(version.versionId, version);
    plans.set(target.planId, { planId: target.planId, biaApplicationId: target.biaApplicationId });
    record(session, "plan.draft.create", { id, versionId: version.versionId });
    return decorate(session, target);
  }

  function versionOrThrow(versionId) {
    const version = versions.get(versionId);
    if (!version) fail(404, "Plan version not found", "NOT_FOUND");
    return version;
  }

  function patchVersion(session, versionId, body) {
    const version = versionOrThrow(versionId);
    const target = targetOrThrow(plans.get(version.planId).biaApplicationId);
    assertEdit(session, target);
    if (version.status === "approved" || version.status === "superseded" || version.status === "retired") {
      fail(409, "Approved versions are immutable; create a new draft", "EC-APR-07");
    }
    if (version.status === "in_review") fail(409, "In-review plans are locked; withdraw to edit", "EC-APR-06");
    if (body.etag != null && Number(body.etag) !== version.etag) {
      fail(409, "Draft was changed by someone else; reload", "EC-PLN-11");
    }
    if (body.title != null) version.title = body.title;
    if (body.templateId != null) version.templateId = body.templateId;
    if (body.strategy != null) {
      if (!STRATEGIES.includes(body.strategy)) fail(400, "Unknown strategy", "FR-5");
      version.strategy = body.strategy;
      target.strategy = body.strategy;
    }
    if (body.claimedRtoMinutes != null) version.claimedRtoMinutes = Number(body.claimedRtoMinutes);
    if (body.claimedRpoMinutes != null) version.claimedRpoMinutes = Number(body.claimedRpoMinutes);
    if (body.steps) {
      version.steps = body.steps.map((s, i) => ({
        stepId: s.stepId || newId("s"),
        order: s.order ?? i + 1,
        title: s.title || `Step ${s.order ?? i + 1}`,
        instruction: s.instruction || "",
        ownerRole: s.ownerRole || "",
        prerequisite: s.prerequisite || "",
        estimatedDurationMinutes: s.estimatedDurationMinutes == null || s.estimatedDurationMinutes === "" ? null : Number(s.estimatedDurationMinutes),
        rollback: s.rollback || "",
        verification: s.verification || "",
      }));
    }
    if (body.contacts) {
      version.contacts = body.contacts.map((c) => ({
        role: c.role,
        name: c.name || "",
        email: c.email || "",
        phone: c.phone || "",
        contactType: c.contactType || "primary",
        escalationOrder: c.escalationOrder == null || c.escalationOrder === "" ? null : Number(c.escalationOrder),
      }));
    }
    if (body.attachmentsAdd) {
      for (const att of body.attachmentsAdd) {
        const name = att.fileName || "";
        if (/\.(exe|bat|cmd|sh)$/i.test(name)) fail(400, "Disallowed attachment type", "EC-PLN-05");
        version.attachments.push({
          id: newId("att"),
          fileName: name || "untitled",
          kind: att.kind || "other",
          note: att.note || "",
        });
      }
    }
    if (body.attachmentRemoveId) {
      version.attachments = version.attachments.filter((a) => a.id !== body.attachmentRemoveId);
    }
    if (body.applyTemplate) {
      const tpl = templateForTier(target.tier);
      version.steps = tpl.steps.map((s, i) => ({
        stepId: newId("s"),
        order: s.order ?? i + 1,
        title: s.title || `Step ${s.order ?? i + 1}`,
        instruction: s.instruction,
        ownerRole: s.ownerRole || "",
        prerequisite: s.prerequisite || "",
        estimatedDurationMinutes: s.estimatedDurationMinutes ?? null,
        rollback: s.rollback || "",
        verification: s.verification || "",
      }));
      version.templateId = tpl.id;
    }
    version.etag += 1;
    version.updatedAt = now().toISOString();
    record(session, "plan.draft.patch", { versionId, etag: version.etag });
    return decorate(session, target);
  }

  function structuredSteps(version) {
    return (version.steps || []).filter((s) => (s.instruction || "").trim().length > 0);
  }

  function submit(session, versionId) {
    const version = versionOrThrow(versionId);
    const target = targetOrThrow(plans.get(version.planId).biaApplicationId);
    assertEdit(session, target);
    if (version.status !== "draft") fail(409, "Only drafts can be submitted", "FR-11");
    if (!target.primaryOwnerUserId) fail(400, "Primary Plan Owner is required before submit", "EC-APR-10");
    if (!target.strategy && !version.strategy) fail(400, "Recovery strategy is required", "EC-AST-09");
    if (!structuredSteps(version).length) fail(400, "Structured recovery steps are required; attachments are not enough", "EC-PLN-01");
    if (!(version.contacts || []).some((c) => (c.name || "").trim())) fail(400, "Recovery contacts are required", "EC-PLN-07");
    const live = liveBia(target.biaApplicationId);
    if (!live && !bia.getIncludingOutOfScope(target.biaApplicationId)) {
      fail(409, "Cannot submit without a BIA read", "EC-BIA-14");
    }
    const obj = effectiveObjectives(target, live);
    if (obj.effectiveRtoMinutes == null && obj.effectiveRpoMinutes == null) {
      fail(400, "Inherited RTO/RPO missing; record a justified override before submit", "EC-BIA-01");
    }
    if (!target.assets.some((a) => a.type === "application")) {
      fail(400, "Target application must be a node in the dependency graph", "EC-AST-08");
    }
    if (hasCycle(target.assets.map((a) => a.assetId), target.dependencies)) {
      fail(400, "Resolve dependency cycles before submit", "EC-AST-01");
    }
    const warnings = [];
    for (const step of version.steps) {
      if (SECRET_HINT.test(step.instruction || "")) warnings.push("Possible secret in runbook text; store a reference, not the secret.");
    }
    version.status = "in_review";
    version.submittedBy = session.userId;
    version.submittedAt = now().toISOString();
    version.etag += 1;
    notify("review.requested", { versionId, biaApplicationId: target.biaApplicationId }, session);
    record(session, "plan.submit", { versionId });
    return { ...decorate(session, target), warnings };
  }

  function withdraw(session, versionId) {
    const version = versionOrThrow(versionId);
    const target = targetOrThrow(plans.get(version.planId).biaApplicationId);
    assertEdit(session, target);
    if (version.status !== "in_review") fail(409, "Only in-review versions can be withdrawn", "EC-APR-06");
    version.status = "draft";
    version.etag += 1;
    record(session, "plan.withdraw", { versionId });
    return decorate(session, target);
  }

  function reject(session, versionId, comments) {
    const version = versionOrThrow(versionId);
    const target = targetOrThrow(plans.get(version.planId).biaApplicationId);
    if (![Roles.ADMIN, Roles.APPROVER].includes(session.role)) fail(403, "Forbidden: cannot reject", "FR-11");
    if (version.status !== "in_review") fail(409, "Only in-review versions can be rejected", "FR-11");
    version.status = "draft";
    version.rejectedBy = session.userId;
    version.rejectedAt = now().toISOString();
    version.reviewComments = [...(version.reviewComments || []), { at: now().toISOString(), by: session.userId, text: comments || "" }];
    version.etag += 1;
    notify("plan.rejected", { versionId }, session);
    record(session, "plan.reject", { versionId, comments });
    return decorate(session, target);
  }

  function approve(session, versionId) {
    const version = versionOrThrow(versionId);
    const target = targetOrThrow(plans.get(version.planId).biaApplicationId);
    if (![Roles.ADMIN, Roles.APPROVER].includes(session.role)) fail(403, "Forbidden: cannot approve", "FR-11");
    if (version.status !== "in_review") fail(409, "Only in-review versions can be approved", "FR-11");
    if (decisions.D5.value.segregationOfDuties && version.submittedBy === session.userId) {
      record(session, "plan.approve.denied_sod", { versionId });
      fail(403, "Author cannot approve their own plan (segregation of duties)", "EC-APR-01");
    }
    if (version.status === "approved") fail(409, "Already approved", "EC-APR-03");
    const live = liveBia(target.biaApplicationId);
    if (!live) fail(409, "Cannot approve without a current BIA read", "EC-BIA-14");
    if (!(version.contacts || []).some((c) => (c.name || "").trim())) fail(400, "Contacts required", "EC-PLN-07");

    const prev = currentApproved(target);
    if (prev) prev.status = "superseded";

    const assetId = target.assets.find((a) => a.type === "application")?.assetId || null;
    const links = (live.processes || []).map((p) => ({
      processId: p.processId,
      assetId,
      applicationId: target.biaApplicationId,
    }));
    version.snapshot = {
      at: now().toISOString(),
      inheritedRtoMinutes: live.inheritedObjectives.rtoMinutes,
      inheritedRpoMinutes: live.inheritedObjectives.rpoMinutes,
      overrideRtoMinutes: target.rtoOverrideMinutes,
      overrideRpoMinutes: target.rpoOverrideMinutes,
      mappingKey: mappingKeyFromProcesses(live.processes),
      processes: clone(live.processes),
      links,
      assets: clone(target.assets),
      dependencies: clone(target.dependencies),
      bcpPlanIds: bia.listBcp(target.biaApplicationId).map((p) => p.planId),
    };
    version.roles = [
      { role: "plan_owner", userId: target.primaryOwnerUserId, displayName: "Plan Owner" },
      { role: "backup_owner", userId: target.backupOwnerUserId, displayName: "Backup Plan Owner" },
      { role: "approver", userId: session.userId, displayName: session.displayName || session.userId },
    ];
    version.status = "approved";
    version.approvedBy = session.userId;
    version.approvedAt = now().toISOString();
    version.lastReviewedAt = version.approvedAt;
    version.nextReviewDueAt = addMonths(now(), recertificationMonths(target.tier)).toISOString();
    version.etag += 1;
    target.currentApprovedVersionId = version.versionId;
    const payload = crisisPayload(target, version);
    notify("plan.approved", { versionId, biaApplicationId: target.biaApplicationId }, session);
    record(session, "plan.approve", { versionId, approvedBy: session.userId, at: version.approvedAt });
    const testRequest = requestTestForVersion(target, version, "publish");
    return { ...decorate(session, target), crisisCompatible: payload, testRequest };
  }

  function newDraftFromApproved(session, id) {
    const target = targetOrThrow(id);
    assertEdit(session, target);
    const approved = currentApproved(target);
    if (!approved) fail(400, "No approved version to clone", "FR-21");
    if (currentDraft(target)) fail(409, "Finish or withdraw the existing draft first", "EC-TGT-02");
    const copy = clone(approved);
    copy.versionId = newId("ver");
    copy.status = "draft";
    copy.etag = 1;
    copy.submittedBy = null;
    copy.submittedAt = null;
    copy.approvedBy = null;
    copy.approvedAt = null;
    copy.snapshot = null;
    copy.createdAt = now().toISOString();
    copy.updatedAt = now().toISOString();
    versions.set(copy.versionId, copy);
    record(session, "plan.draft.from_approved", { versionId: copy.versionId });
    return decorate(session, target);
  }

  function retire(session, id) {
    if (!canManage(session)) fail(403, "Only Admin can retire a plan", "EC-APR-09");
    const target = targetOrThrow(id);
    const approved = currentApproved(target);
    if (approved) approved.status = "retired";
    const draft = currentDraft(target);
    if (draft) draft.status = "retired";
    target.retired = true;
    target.currentApprovedVersionId = approved ? approved.versionId : target.currentApprovedVersionId;
    record(session, "plan.retire", { id });
    return decorate(session, target);
  }

  function inbox(session) {
    if (![Roles.ADMIN, Roles.APPROVER, Roles.AUDITOR].includes(session.role)) {
      fail(403, "Approval inbox is for reviewers", "FR-11");
    }
    return [...versions.values()]
      .filter((v) => v.status === "in_review")
      .map((v) => {
        const plan = plans.get(v.planId);
        const target = targets.get(plan.biaApplicationId);
        return {
          versionId: v.versionId,
          planId: v.planId,
          title: v.title,
          biaApplicationId: target.biaApplicationId,
          name: target.name,
          submittedBy: v.submittedBy,
          submittedAt: v.submittedAt,
        };
      });
  }

  function ingestCmdb(session, payload) {
    if (!canManage(session)) fail(403, "CMDB ingest is an Admin/coordinator action", "FR-1");
    cmdbLastSyncAt = now().toISOString();
    if (!payload?.biaApplicationId || !targets.has(payload.biaApplicationId)) {
      cmdbOrphans.push({ ...payload, at: cmdbLastSyncAt });
      return { attached: false, orphan: true, cmdbLastSyncAt };
    }
    const target = targets.get(payload.biaApplicationId);
    const existing = target.assets.find((a) => a.assetId === payload.ciId);
    if (existing) {
      existing.name = payload.name ?? existing.name;
      existing.type = payload.type ?? existing.type;
      existing.ownerUserId = payload.techOwner ?? existing.ownerUserId;
      existing.source = "cmdb";
    } else {
      target.assets.push({
        assetId: payload.ciId,
        name: payload.name,
        type: payload.type || "infrastructure",
        environment: "prod",
        ownerUserId: payload.techOwner || null,
        criticality: "medium",
        source: "cmdb",
        recoveryNotes: null,
      });
    }
    return { attached: true, orphan: false, cmdbLastSyncAt };
  }

  // Seed from BIA at construction using demo tenant.
  syncFromBia({ tenantId: bia.tenantId, role: Roles.ADMIN, userId: "system" });

  return {
    directory: () => DIRECTORY,
    templates: () => listTemplates(),
    catalogs: () => ({ strategies: [...STRATEGIES], ...fieldCatalogs() }),
    coverage,
    getTarget(session, id) {
      const target = targetOrThrow(id);
      assertView(session, target);
      return decorate(session, target);
    },
    history(session, id) {
      const target = targetOrThrow(id);
      assertView(session, target);
      return versionsFor(target.planId || "")
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map((v) => ({
          versionId: v.versionId,
          status: v.status,
          title: v.title,
          submittedBy: v.submittedBy,
          submittedAt: v.submittedAt,
          approvedBy: v.approvedBy,
          approvedAt: v.approvedAt,
          etag: v.etag,
        }));
    },
    patchTarget,
    ack,
    addAsset,
    removeAsset,
    addDependency,
    createDraft,
    patchVersion,
    submit,
    withdraw,
    reject,
    approve,
    newDraftFromApproved,
    retire,
    inbox,
    ingestCmdb,
    cmdbStatus: () => ({ lastSyncAt: cmdbLastSyncAt, orphans: clone(cmdbOrphans) }),
    updateBia(session, id, body) {
      if (!canManage(session)) fail(403, "BIA remains system of record; this is a demo adapter write", "FR-3");
      const updated = bia.upsert({ biaApplicationId: id, ...body });
      syncFromBia(session);
      record(session, "bia.adapter.update", { id, inScope: updated.inScope });
      if (targets.has(id) && currentApproved(targets.get(id))) {
        const live = liveBia(id);
        const ready = computeReadiness({
          target: targets.get(id),
          approvedVersion: currentApproved(targets.get(id)),
          liveBia: live,
          now: now(),
          tests: testsFor(targets.get(id)),
        });
        if (ready.drift) notify("bia.drift", { id, drift: ready.drift }, session);
      }
      return decorate(session, targetOrThrow(id));
    },
    addBiaApplication(session, body) {
      if (!canManage(session)) fail(403, "Forbidden", "FR-3");
      const id = body.biaApplicationId || newId("bia-app");
      if (targets.has(id) || bia.getIncludingOutOfScope(id)) fail(409, "Application already exists", "EC-TGT-01");
      const tier = body.tier == null || body.tier === "" ? 2 : Number(body.tier);
      const rto = body.rtoMinutes == null || body.rtoMinutes === "" ? null : Number(body.rtoMinutes);
      const rpo = body.rpoMinutes == null || body.rpoMinutes === "" ? null : Number(body.rpoMinutes);
      bia.upsert({
        biaApplicationId: id,
        name: body.name || id,
        tenantId: session.tenantId || bia.tenantId,
        criticality: body.criticality || (tier === 1 ? "high" : tier === 3 ? "low" : "medium"),
        tier,
        inScope: body.inScope !== false,
        processes: body.processes?.length
          ? body.processes
          : [
              {
                processId: body.processId || `proc-${id}`,
                name: body.processName || `${body.name || id} primary process`,
                rtoMinutes: rto,
                rpoMinutes: rpo,
              },
            ],
      });
      syncFromBia(session);
      const patch = {
        lifecycleStatus: body.lifecycleStatus || "active",
        vendorDependencies: body.vendorDependencies || "",
        primarySite: body.primarySite || "",
        recoverySite: body.recoverySite || "",
      };
      if (body.applicationType) patch.applicationType = body.applicationType;
      if (body.hostingEnvironment) patch.hostingEnvironment = body.hostingEnvironment;
      if (body.strategy) patch.strategy = body.strategy;
      if (body.backupFrequency) patch.backupFrequency = body.backupFrequency;
      if (body.backupRetentionValue !== "" && body.backupRetentionValue != null) patch.backupRetentionValue = Number(body.backupRetentionValue);
      if (body.backupRetentionUnit) patch.backupRetentionUnit = body.backupRetentionUnit;
      if (body.failoverMethod) patch.failoverMethod = body.failoverMethod;
      if (body.applicationOwnerUserId) patch.applicationOwnerUserId = body.applicationOwnerUserId;
      if (body.primaryOwnerUserId) patch.primaryOwnerUserId = body.primaryOwnerUserId;
      if (body.backupOwnerUserId) patch.backupOwnerUserId = body.backupOwnerUserId;
      if (body.rtoOverrideMinutes != null || body.rpoOverrideMinutes != null) {
        patch.rtoOverrideMinutes = body.rtoOverrideMinutes;
        patch.rpoOverrideMinutes = body.rpoOverrideMinutes;
        patch.overrideReason = body.overrideReason;
      }
      patchTarget(session, id, patch);
      const assetPayloads = [
        ...(Array.isArray(body.assets) ? body.assets : []),
        ...(Array.isArray(body.infrastructure) ? body.infrastructure : []),
      ].filter((a) => a && (a.name || a.assetId));
      if (assetPayloads.length) {
        for (const a of assetPayloads) {
          addAsset(session, id, {
            assetId: a.assetId || undefined,
            name: a.name,
            type: a.type || body.infrastructureType || "infrastructure",
            environment: a.environment || "prod",
            criticality: a.criticality || (tier === 1 ? "high" : "medium"),
            ownerUserId: a.ownerUserId || null,
            recoveryNotes: a.recoveryNotes || a.notes || body.infrastructureNotes || null,
          });
        }
      } else {
        const names = [
          ...(Array.isArray(body.infrastructureNames) ? body.infrastructureNames : []),
          ...(body.infrastructureName ? [body.infrastructureName] : []),
        ].filter(Boolean);
        for (const name of names) {
          addAsset(session, id, {
            name,
            type: body.infrastructureType || "infrastructure",
            environment: "prod",
            criticality: tier === 1 ? "high" : "medium",
            recoveryNotes: body.infrastructureNotes || null,
          });
        }
      }
      record(session, "application.create", { id });
      return decorate(session, targetOrThrow(id));
    },
    setBiaAvailable(value) {
      bia.setAvailable(value);
    },
    exportCoverage(session) {
      if (session.role !== Roles.AUDITOR && session.role !== Roles.ADMIN) {
        fail(403, "Export is for Auditor/Admin", "FR-30");
      }
      const data = coverage(session);
      return {
        exportedAt: now().toISOString(),
        phase: 2,
        note: "Coverage plus bound test evidence. ISO-mapped pack is Phase 3.",
        ...data,
      };
    },
    crisisInspect(session, id) {
      const target = targetOrThrow(id);
      assertView(session, target);
      const approved = currentApproved(target);
      if (!approved) fail(404, "No approved plan to inspect", "D6");
      return crisisPayload(target, approved);
    },
    testingCatalog() {
      let apps;
      try {
        apps = bia.list(bia.tenantId);
      } catch {
        apps = bia.listCached(bia.tenantId).filter((a) => a.inScope);
      }
      const applications = apps.map((app) => {
        const target = targets.get(app.biaApplicationId);
        const approved = target ? currentApproved(target) : null;
        const obj = target ? effectiveObjectives(target, app) : { effectiveRtoMinutes: mostDemandingObjectives(app.processes).rtoMinutes, effectiveRpoMinutes: mostDemandingObjectives(app.processes).rpoMinutes };
        return {
          biaApplicationId: app.biaApplicationId,
          name: app.name,
          tier: app.tier,
          targetRtoMinutes: obj.effectiveRtoMinutes ?? null,
          targetRpoMinutes: obj.effectiveRpoMinutes ?? null,
          currentApprovedVersionId: approved?.versionId || null,
          recoveryTeam: (approved?.contacts || []).map((c) => ({
            name: c.name || "",
            role: c.role || "",
            contactType: c.contactType || "primary",
            email: c.email || "",
          })),
        };
      });
      return {
        types: testingModule.types(),
        exerciseModes: [...EXERCISE_MODES],
        outcomes: ["pass", "fail", "partial"],
        stepOutcomes: ["pass", "fail", "na"],
        applications,
        users: DIRECTORY,
        catalogs: { strategies: [...STRATEGIES], exerciseModes: [...EXERCISE_MODES], ...fieldCatalogs() },
      };
    },
    testing: testingModule,
    ingestResult(session, payload) {
      const { drReady: _ignored, ...rest } = payload || {};
      if (rest.resultId && ingestedResults.has(rest.resultId)) {
        return { idempotent: true, resultId: rest.resultId };
      }
      if (!rest.planVersionId) {
        record(session, "testing.ingest.ignored", { reason: "unbound", resultId: rest.resultId });
        return { ignored: true, reason: "unbound" };
      }
      if (rest.testType && rest.testType !== DR_TEST) {
        record(session, "testing.ingest.ignored", { reason: "not_dr_test", testType: rest.testType });
        return { ignored: true, reason: "not_dr_test" };
      }
      let test;
      if (rest.testId) {
        test = testingModule.complete(rest.testId, rest, session);
      } else {
        test = testingModule.schedule({
          testType: DR_TEST,
          planVersionId: rest.planVersionId,
          targetBiaApplicationId: rest.targetBiaApplicationId,
        });
        test = testingModule.complete(test.testId, rest, session);
      }
      if (test.resultId) ingestedResults.add(test.resultId);
      record(session, "testing.ingest", { testId: test.testId, resultId: test.resultId, planVersionId: test.planVersionId });
      const plan = [...plans.values()].find((p) => p.planId === (versions.get(test.planVersionId)?.planId));
      const target = plan ? targets.get(plan.biaApplicationId) : rest.targetBiaApplicationId ? targets.get(rest.targetBiaApplicationId) : null;
      return { ignored: false, test, readiness: target ? decorate(session, target).readiness : null };
    },
    retryTestOutbox() {
      const remaining = [];
      const results = [];
      for (const item of testOutbox) {
        try {
          const created = testingModule.requestDrTest(item);
          results.push({ ok: true, testId: created.testId });
        } catch (err) {
          remaining.push({ ...item, lastError: err.message });
          results.push({ ok: false, error: err.message });
        }
      }
      testOutbox.length = 0;
      testOutbox.push(...remaining);
      return { results, queued: testOutbox.length };
    },
    recertificationTick(session) {
      const DAY = 86400000;
      const requested = [];
      const reminders = [];
      for (const target of targets.values()) {
        if (target.tenantId !== session.tenantId || target.retired || target.outOfBiaScope) continue;
        const approved = currentApproved(target);
        if (!approved) continue;
        const months = recertificationMonths(target.tier);
        const expiresAt = addMonths(new Date(approved.approvedAt), months);
        const daysLeft = Math.ceil((expiresAt.getTime() - now().getTime()) / DAY);
        for (const d of [30, 14, 7, 1]) {
          const key = `${approved.versionId}:d${d}`;
          if (daysLeft === d && !reminderKeys.has(key)) {
            reminderKeys.add(key);
            notify("test.due", { biaApplicationId: target.biaApplicationId, versionId: approved.versionId, daysLeft: d }, session);
            reminders.push(key);
          }
        }
        if (daysLeft <= 0) {
          const result = requestTestForVersion(target, approved, "recertification_due");
          requested.push({ biaApplicationId: target.biaApplicationId, ...result });
        }
      }
      return { reminders, requested, at: now().toISOString() };
    },
    dashboard(session) {
      const cov = coverage(session);
      const tier12 = cov.rows.filter((r) => (r.tier === 1 || r.tier === 2) && r.readiness?.inCoverageDenominator !== false && !r.outOfBiaScope && !r.retired);
      const currentPlans = tier12.filter((r) => r.readiness?.kpiEligible);
      const testedInWindow = tier12.filter((r) => r.readiness?.dimensions?.test);
      const testedCurrent = tier12.filter((r) => r.readiness?.evidence?.testId);
      const meeting = testedCurrent.filter((r) => r.readiness?.testEval?.meetsRtoRpo);
      const remediations = cov.rows.filter((r) => r.readiness?.status === "failed_test");
      const overdue = cov.rows.filter((r) => r.readiness?.status === "expired");
      const drift = cov.rows.filter((r) => r.readiness?.status === "bia_drift" || r.readiness?.drift);
      function tile(id, label, numerator, denominator, members) {
        return {
          id,
          label,
          population: "tier_1_2_in_bia_scope",
          numerator,
          denominator,
          percent: denominator ? Math.round((numerator / denominator) * 1000) / 10 : null,
          members: members.map((r) => ({
            biaApplicationId: r.biaApplicationId,
            name: r.name,
            status: r.readiness?.status,
            evidence: r.evidence || r.readiness?.evidence,
          })),
        };
      }
      return {
        generatedAt: cov.generatedAt,
        phase: 2,
        population: "tier_1_2_in_bia_scope",
        kpis: {
          currentPlans: tile("currentPlans", "% Applications with Approved Plan", currentPlans.length, tier12.length, currentPlans),
          testedInWindow: tile("testedInWindow", "% Plans Tested Within Policy Window", testedInWindow.length, tier12.length, testedInWindow),
          testedMeetingRtoRpo: tile(
            "testedMeetingRtoRpo",
            "% Plans Meeting Target RTO/RPO",
            meeting.length,
            testedCurrent.length,
            meeting
          ),
        },
        remediations: remediations.map((r) => ({
          biaApplicationId: r.biaApplicationId,
          name: r.name,
          evidence: r.evidence || r.readiness?.evidence,
          gaps: r.readiness?.gaps,
        })),
        overdueRecertifications: overdue.map((r) => ({ biaApplicationId: r.biaApplicationId, name: r.name, evidence: r.evidence })),
        biaDrift: drift.map((r) => ({ biaApplicationId: r.biaApplicationId, name: r.name, drift: r.readiness?.drift })),
        countsByStatus: cov.countsByStatus,
        rows: cov.rows,
      };
    },
    processView(session, processId) {
      const apps = [];
      for (const t of targets.values()) {
        if (t.tenantId !== session.tenantId) continue;
        const live = liveBia(t.biaApplicationId);
        if (!(live?.processes || []).some((p) => p.processId === processId)) continue;
        const row = decorate(session, t);
        apps.push({
          biaApplicationId: t.biaApplicationId,
          name: t.name,
          readiness: row.readiness,
          evidence: row.readiness.evidence,
          tests: row.tests.filter((x) => x.testType === DR_TEST),
        });
      }
      return { processId, note: "A process has no DR plan; applications mapped to it do.", applications: apps };
    },
    testHistory(session, id) {
      const target = targetOrThrow(id);
      assertView(session, target);
      return { items: testsFor(target), testingHref: "/#testing" };
    },
    _test: { targets, versions, bia, testing: testingModule, testOutbox },
  };
}
