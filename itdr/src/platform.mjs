/**
 * BCM platform stubs used by the ITDR module shell.
 * Phase 0 reuses these hooks rather than rebuilding identity, audit, or mail.
 */

export const Roles = Object.freeze({
  ADMIN: "ADMIN",
  PLAN_OWNER: "PLAN_OWNER",
  APPROVER: "APPROVER",
  AUDITOR: "AUDITOR",
  EXECUTIVE: "EXECUTIVE",
  TEST_MANAGER: "TEST_MANAGER",
  INCIDENT_COMMANDER: "INCIDENT_COMMANDER",
});

/** ITDR RBAC roles from PRD FR-30. Test Manager is not among them. */
export const ITDR_ROLES = Object.freeze([
  Roles.ADMIN,
  Roles.PLAN_OWNER,
  Roles.APPROVER,
  Roles.AUDITOR,
  Roles.EXECUTIVE,
]);

export const Permissions = Object.freeze({
  ACCESS: "itdr.access",
  ADMIN: "itdr.admin",
  AUDIT_READ: "itdr.audit.read",
  FLAGS_WRITE: "itdr.flags.write",
  EXECUTIVE_VIEW: "itdr.executive.view",
  EXPORT: "itdr.export",
  INVOKE: "itdr.invoke",
});

const ROLE_PERMISSIONS = Object.freeze({
  [Roles.ADMIN]: [
    Permissions.ACCESS,
    Permissions.ADMIN,
    Permissions.AUDIT_READ,
    Permissions.FLAGS_WRITE,
    Permissions.EXECUTIVE_VIEW,
    Permissions.EXPORT,
  ],
  [Roles.PLAN_OWNER]: [Permissions.ACCESS],
  [Roles.APPROVER]: [Permissions.ACCESS],
  [Roles.AUDITOR]: [Permissions.ACCESS, Permissions.AUDIT_READ, Permissions.EXPORT],
  [Roles.EXECUTIVE]: [Permissions.ACCESS, Permissions.EXECUTIVE_VIEW],
  [Roles.TEST_MANAGER]: [],
  [Roles.INCIDENT_COMMANDER]: [],
});

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] ? [...ROLE_PERMISSIONS[role]] : [];
}

export function isItdrRole(role) {
  return ITDR_ROLES.includes(role);
}

export function can(role, permission) {
  return permissionsFor(role).includes(permission);
}

export function assertCan(role, permission) {
  if (!can(role, permission)) {
    const error = new Error(`Forbidden: ${role || "anonymous"} lacks ${permission}`);
    error.statusCode = role ? 403 : 401;
    error.code = role ? "FORBIDDEN" : "UNAUTHENTICATED";
    throw error;
  }
}

export function createFeatureFlags(initial = { itdrEnabled: true }) {
  const flags = { ...initial };
  return {
    isItdrEnabled: () => flags.itdrEnabled === true,
    setItdrEnabled(value, actor) {
      flags.itdrEnabled = Boolean(value);
      return { itdrEnabled: flags.itdrEnabled, actor };
    },
    snapshot: () => ({ ...flags }),
  };
}

export function createTenancy() {
  return {
    assertSameTenant(sessionTenantId, resourceTenantId) {
      if (!sessionTenantId || !resourceTenantId) {
        const error = new Error("Tenant required");
        error.statusCode = 403;
        error.code = "TENANCY";
        throw error;
      }
      if (sessionTenantId !== resourceTenantId) {
        const error = new Error("Cross-tenant access denied");
        error.statusCode = 403;
        error.code = "CROSS_TENANT";
        throw error;
      }
    },
  };
}

export function createAuditLog() {
  const entries = [];
  return {
    record(entry) {
      const row = {
        id: `aud-${entries.length + 1}`,
        at: new Date().toISOString(),
        ...entry,
      };
      entries.push(row);
      return row;
    },
    list() {
      return [...entries].reverse();
    },
    clear() {
      entries.length = 0;
    },
  };
}

export function createNotificationBus() {
  const events = [];
  const types = Object.freeze([
    "plan.assigned",
    "review.requested",
    "plan.approved",
    "plan.rejected",
    "test.due",
    "bia.drift",
  ]);
  return {
    types,
    publish(type, payload, actor) {
      if (!types.includes(type)) {
        const error = new Error(`Unknown notification type: ${type}`);
        error.statusCode = 400;
        throw error;
      }
      const event = {
        id: `ntf-${events.length + 1}`,
        type,
        payload,
        actor,
        at: new Date().toISOString(),
      };
      events.push(event);
      return event;
    },
    list() {
      return [...events].reverse();
    },
  };
}

export function createSessionStore() {
  const sessions = new Map();
  return {
    get(id) {
      return sessions.get(id) || null;
    },
    put(id, session) {
      sessions.set(id, session);
      return session;
    },
  };
}
