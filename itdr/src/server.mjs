import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { listDecisions, RECORDED_AT } from "./decisions.mjs";
import { catalog } from "./contracts.mjs";
import { createMocks } from "./mocks.mjs";
import { DIRECTORY, createItdrModule } from "./itdrModule.mjs";
import {
  Permissions,
  Roles,
  assertCan,
  createAuditLog,
  createFeatureFlags,
  createNotificationBus,
  createSessionStore,
  createTenancy,
  isItdrRole,
  permissionsFor,
} from "./platform.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");
const DEFAULT_PORT = Number(process.env.PORT || process.env.ITDR_PORT || 8787);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function send(res, status, body, extraHeaders = {}) {
  const json = typeof body !== "string";
  const payload = json ? JSON.stringify(body) : body;
  res.writeHead(status, {
    "content-type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

function notFound(res, message = "Not found") {
  send(res, 404, { error: message, code: "NOT_FOUND" });
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sessionPayload(session) {
  return {
    userId: session.userId,
    displayName: session.displayName,
    role: session.role,
    tenantId: session.tenantId,
    isItdrRole: isItdrRole(session.role),
    permissions: permissionsFor(session.role),
  };
}

export function createApp(options = {}) {
  const flags = createFeatureFlags({ itdrEnabled: options.itdrEnabled !== false });
  const audit = createAuditLog();
  const notifications = createNotificationBus();
  const sessions = createSessionStore();
  const tenancy = createTenancy();
  const mocks = createMocks();
  const itdr = createItdrModule({
    audit,
    notifications,
    now: options.now || (() => new Date()),
    testing: options.testing,
  });

  const defaultSession = {
    userId: "user-admin",
    displayName: "Jordan Admin",
    role: Roles.ADMIN,
    tenantId: "tenant-demo",
  };

  function requireSession(req) {
    const sid = parseCookies(req.headers.cookie).sid;
    const session = sid ? sessions.get(sid) : null;
    if (!session) {
      const error = new Error("Sign in required");
      error.statusCode = 401;
      error.code = "UNAUTHENTICATED";
      throw error;
    }
    return { sid, session };
  }

  function gatedItdr(req) {
    const { session } = requireSession(req);
    if (!flags.isItdrEnabled()) {
      const error = new Error("ITDR module is disabled");
      error.statusCode = 404;
      error.code = "MODULE_DISABLED";
      throw error;
    }
    assertCan(session.role, Permissions.ACCESS);
    return session;
  }

  async function handleApi(req, res, url) {
    const path = url.pathname;
    const method = req.method || "GET";

    if (path === "/api/health" && method === "GET") {
      send(res, 200, {
        service: "bcm-itdr",
        phase: 2,
        itdrEnabled: flags.isItdrEnabled(),
      });
      return;
    }

    if (path === "/api/session" && method === "GET") {
      try {
        const { session } = requireSession(req);
        send(res, 200, sessionPayload(session));
      } catch (err) {
        send(res, 200, { userId: null, role: null, tenantId: null, permissions: [] });
      }
      return;
    }

    if (path === "/api/session" && method === "PUT") {
      const body = await readJson(req);
      const role = body.role || Roles.ADMIN;
      if (!Object.values(Roles).includes(role)) {
        send(res, 400, { error: `Unknown role ${role}` });
        return;
      }
      const known = DIRECTORY.find((u) => u.role === role);
      const session = {
        userId: body.userId || known?.userId || `user-${role.toLowerCase()}`,
        displayName: body.displayName || known?.displayName || role.replaceAll("_", " "),
        role,
        tenantId: body.tenantId || "tenant-demo",
      };
      const sid = parseCookies(req.headers.cookie).sid || randomUUID();
      sessions.put(sid, session);
      audit.record({
        actor: session.userId,
        role: session.role,
        tenantId: session.tenantId,
        action: "session.set",
        path,
        method,
        status: 200,
      });
      send(res, 200, sessionPayload(session), {
        "set-cookie": `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`,
      });
      return;
    }

    let session;
    try {
      if (path === "/api/itdr/flags" && method === "PUT") {
        ({ session } = requireSession(req));
        assertCan(session.role, Permissions.FLAGS_WRITE);
        const body = await readJson(req);
        const next = flags.setItdrEnabled(body.itdrEnabled, session.userId);
        audit.record({
          actor: session.userId,
          role: session.role,
          tenantId: session.tenantId,
          action: "flags.set",
          path,
          method,
          status: 200,
        });
        send(res, 200, next);
        return;
      }

      if (path.startsWith("/api/testing")) {
        ({ session } = requireSession(req));
        if (session.role === Roles.INCIDENT_COMMANDER) {
          const error = new Error("Forbidden");
          error.statusCode = 403;
          error.code = "FORBIDDEN";
          throw error;
        }
      } else if (path.startsWith("/api/itdr")) {
        session = gatedItdr(req);
      }
    } catch (err) {
      const status = err.statusCode || 500;
      if (session || status !== 401) {
        try {
          const fallback = session || requireSession(req).session;
          audit.record({
            actor: fallback.userId,
            role: fallback.role,
            tenantId: fallback.tenantId,
            action: "deny",
            path,
            method,
            status,
            detail: err.message,
          });
        } catch {
          /* unauthenticated */
        }
      }
      send(res, status, { error: err.message, code: err.code || "ERROR" });
      return;
    }

    function auditOk(action, status = 200) {
      audit.record({
        actor: session.userId,
        role: session.role,
        tenantId: session.tenantId,
        action,
        path,
        method,
        status,
      });
    }

    if (path === "/api/testing/types" && method === "GET") {
      send(res, 200, { types: itdr.testing.types() });
      return;
    }
    if (path === "/api/testing/options" && method === "GET") {
      send(res, 200, itdr.testingCatalog());
      return;
    }
    if (path === "/api/testing/tests" && method === "GET") {
      send(res, 200, { items: itdr.testing.list({ testType: url.searchParams.get("testType") || undefined }) });
      return;
    }
    if (path === "/api/testing/tests" && method === "POST") {
      if (![Roles.TEST_MANAGER, Roles.ADMIN].includes(session.role)) {
        send(res, 403, { error: "Only Test Manager schedules tests", code: "FORBIDDEN" });
        return;
      }
      send(res, 201, itdr.testing.schedule(await readJson(req)));
      return;
    }
    const completeTest = path.match(/^\/api\/testing\/tests\/([^/]+)\/complete$/);
    if (completeTest && method === "POST") {
      if (![Roles.TEST_MANAGER, Roles.ADMIN].includes(session.role)) {
        send(res, 403, { error: "Only Test Manager records results", code: "FORBIDDEN" });
        return;
      }
      const body = await readJson(req);
      const completed = itdr.testing.complete(decodeURIComponent(completeTest[1]), body, session);
      const ingest = itdr.ingestResult(session, { ...completed, testId: completed.testId, testType: completed.testType, drReady: body.drReady });
      send(res, 200, { test: completed, ingest, schedulerOfRecord: "Testing" });
      return;
    }

    if (path === "/api/itdr/status" && method === "GET") {
      auditOk("read");
      send(res, 200, {
        phase: 2,
        module: "ITDR",
        empty: false,
        itdrEnabled: flags.isItdrEnabled(),
        session: sessionPayload(session),
        productionSchema: false,
        notes: [
          "Phase 2: DR Test binding, derived ready, operational dashboard.",
          "Ready requires an in-cycle pass on the current approved version.",
          "Crisis invocation remains deferred. Testing owns the calendar.",
        ],
      });
      return;
    }

    if (path === "/api/itdr/decisions" && method === "GET") {
      send(res, 200, { recordedAt: RECORDED_AT, items: listDecisions() });
      return;
    }

    if (path === "/api/itdr/contracts" && method === "GET") {
      send(res, 200, catalog());
      return;
    }

    if (path === "/api/itdr/spikes/bia" && method === "GET") {
      tenancy.assertSameTenant(session.tenantId, "tenant-demo");
      send(res, 200, { applications: mocks.listBiaApplications(session.tenantId) });
      return;
    }

    if (path === "/api/itdr/spikes/bcp" && method === "GET") {
      const applicationId = url.searchParams.get("applicationId") || "bia-app-payments";
      send(res, 200, { links: mocks.listBcpLinks(applicationId) });
      return;
    }

    if (path === "/api/itdr/spikes/crisis" && method === "GET") {
      send(res, 200, {
        invocationUi: false,
        sample: mocks.crisisCompatibleSample(),
      });
      return;
    }

    if (path === "/api/itdr/spikes/testing" && method === "GET") {
      send(res, 200, mocks.testingContractSpike());
      return;
    }

    if (path === "/api/itdr/spikes/cmdb" && method === "GET") {
      send(res, 200, { adapter: "stub", payload: mocks.cmdbMinimumPayload() });
      return;
    }

    if (path === "/api/itdr/audit" && method === "GET") {
      assertCan(session.role, Permissions.AUDIT_READ);
      send(res, 200, { entries: audit.list() });
      return;
    }

    if (path === "/api/itdr/notifications" && method === "GET") {
      send(res, 200, { types: notifications.types, events: notifications.list() });
      return;
    }

    if (path === "/api/itdr/notifications" && method === "POST") {
      assertCan(session.role, Permissions.ADMIN);
      const body = await readJson(req);
      const event = notifications.publish(body.type || "plan.assigned", body.payload || {}, session.userId);
      send(res, 201, event);
      return;
    }

    if (path === "/api/itdr/coverage" && method === "GET") {
      send(res, 200, itdr.coverage(session));
      return;
    }

    if (path === "/api/itdr/dashboard" && method === "GET") {
      send(res, 200, itdr.dashboard(session));
      return;
    }

    if (path === "/api/itdr/recertification/tick" && method === "POST") {
      send(res, 200, itdr.recertificationTick(session));
      return;
    }

    if (path === "/api/itdr/tests/ingest" && method === "POST") {
      send(res, 200, itdr.ingestResult(session, await readJson(req)));
      return;
    }

    if (path === "/api/itdr/tests/outbox/retry" && method === "POST") {
      assertCan(session.role, Permissions.ADMIN);
      send(res, 200, itdr.retryTestOutbox());
      return;
    }

    const processPath = path.match(/^\/api\/itdr\/processes\/([^/]+)$/);
    if (processPath && method === "GET") {
      send(res, 200, itdr.processView(session, decodeURIComponent(processPath[1])));
      return;
    }

    if (path === "/api/itdr/directory" && method === "GET") {
      send(res, 200, { users: itdr.directory() });
      return;
    }

    if (path === "/api/itdr/catalogs" && method === "GET") {
      send(res, 200, itdr.catalogs());
      return;
    }

    if (path === "/api/itdr/templates" && method === "GET") {
      send(res, 200, { templates: itdr.templates() });
      return;
    }

    if (path === "/api/itdr/approvals" && method === "GET") {
      send(res, 200, { items: itdr.inbox(session) });
      return;
    }

    if (path === "/api/itdr/export/coverage" && method === "GET") {
      send(res, 200, itdr.exportCoverage(session));
      return;
    }

    if (path === "/api/itdr/cmdb/ingest" && method === "POST") {
      const body = await readJson(req);
      send(res, 200, itdr.ingestCmdb(session, body));
      return;
    }

    if (path === "/api/itdr/cmdb/status" && method === "GET") {
      send(res, 200, itdr.cmdbStatus());
      return;
    }

    if (path === "/api/itdr/bia/applications" && method === "POST") {
      const body = await readJson(req);
      send(res, 201, itdr.addBiaApplication(session, body));
      return;
    }

    const biaId = path.match(/^\/api\/itdr\/bia\/applications\/([^/]+)$/);
    if (biaId && method === "PATCH") {
      const body = await readJson(req);
      send(res, 200, itdr.updateBia(session, decodeURIComponent(biaId[1]), body));
      return;
    }

    if (path === "/api/itdr/targets" && method === "POST") {
      send(res, 400, { error: "Targets are seeded from BIA; they cannot be typed from scratch", code: "EC-TGT-01" });
      return;
    }

    const assetDel = path.match(/^\/api\/itdr\/targets\/([^/]+)\/assets\/([^/]+)$/);
    if (assetDel && method === "DELETE") {
      send(res, 200, itdr.removeAsset(session, decodeURIComponent(assetDel[1]), decodeURIComponent(assetDel[2])));
      return;
    }

    const targetSub = path.match(/^\/api\/itdr\/targets\/([^/]+)\/([^/]+)$/);
    if (targetSub) {
      const id = decodeURIComponent(targetSub[1]);
      const action = targetSub[2];
      if (action === "ack" && method === "POST") {
        send(res, 200, itdr.ack(session, id));
        return;
      }
      if (action === "assets" && method === "POST") {
        send(res, 201, itdr.addAsset(session, id, await readJson(req)));
        return;
      }
      if (action === "dependencies" && method === "POST") {
        send(res, 201, itdr.addDependency(session, id, await readJson(req)));
        return;
      }
      if (action === "plan" && method === "POST") {
        send(res, 201, itdr.createDraft(session, id, await readJson(req).catch(() => ({}))));
        return;
      }
      if (action === "new-draft" && method === "POST") {
        send(res, 201, itdr.newDraftFromApproved(session, id));
        return;
      }
      if (action === "retire" && method === "POST") {
        send(res, 200, itdr.retire(session, id));
        return;
      }
      if (action === "history" && method === "GET") {
        send(res, 200, { items: itdr.history(session, id) });
        return;
      }
      if (action === "tests" && method === "GET") {
        send(res, 200, itdr.testHistory(session, id));
        return;
      }
      if (action === "crisis-shape" && method === "GET") {
        send(res, 200, itdr.crisisInspect(session, id));
        return;
      }
    }

    const targetOne = path.match(/^\/api\/itdr\/targets\/([^/]+)$/);
    if (targetOne && method === "GET") {
      send(res, 200, itdr.getTarget(session, decodeURIComponent(targetOne[1])));
      return;
    }
    if (targetOne && method === "PATCH") {
      send(res, 200, itdr.patchTarget(session, decodeURIComponent(targetOne[1]), await readJson(req)));
      return;
    }

    const verSub = path.match(/^\/api\/itdr\/versions\/([^/]+)\/([^/]+)$/);
    if (verSub) {
      const versionId = decodeURIComponent(verSub[1]);
      const action = verSub[2];
      if (action === "submit" && method === "POST") {
        send(res, 200, itdr.submit(session, versionId));
        return;
      }
      if (action === "withdraw" && method === "POST") {
        send(res, 200, itdr.withdraw(session, versionId));
        return;
      }
      if (action === "approve" && method === "POST") {
        send(res, 200, itdr.approve(session, versionId));
        return;
      }
      if (action === "reject" && method === "POST") {
        const body = await readJson(req);
        send(res, 200, itdr.reject(session, versionId, body.comments));
        return;
      }
    }

    const verOne = path.match(/^\/api\/itdr\/versions\/([^/]+)$/);
    if (verOne && method === "PATCH") {
      send(res, 200, itdr.patchVersion(session, decodeURIComponent(verOne[1]), await readJson(req)));
      return;
    }

    if (path === "/api/itdr/invoke" && method === "POST") {
      assertCan(session.role, Permissions.INVOKE);
      send(res, 501, { error: "Invocation is Crisis-owned (D7)" });
      return;
    }

    if (path.startsWith("/api/itdr/placeholders/") && method === "GET") {
      send(res, 501, {
        error: "Not in Phase 2",
        resource: path.split("/").pop(),
        availableIn: "Phase 3+",
      });
      return;
    }

    notFound(res);
  }

  async function handle(req, res) {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
        return;
      }

      const requestPath = url.pathname === "/" || url.pathname === "/itdr" || url.pathname.startsWith("/itdr/")
        ? "/index.html"
        : url.pathname;
      const filePath = join(PUBLIC_DIR, requestPath.replace(/^\/+/, ""));
      if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        res.end("<h1>Not found</h1>");
        return;
      }
      const type = MIME[extname(filePath)] || "application/octet-stream";
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      createReadStream(filePath).pipe(res);
    } catch (err) {
      send(res, err.statusCode || 500, { error: err.message, code: err.code || "ERROR" });
    }
  }

  return {
    handle,
    flags,
    audit,
    sessions,
    defaultSession,
    itdr,
    seedSession(id = "test-sid") {
      sessions.put(id, { ...defaultSession });
      return id;
    },
  };
}

export function start(options = {}) {
  const app = createApp(options);
  const server = createServer((req, res) => {
    app.handle(req, res).catch((err) => {
      if (!res.headersSent) {
        send(res, 500, { error: err.message || "Internal error" });
      }
    });
  });
  const port = options.port ?? DEFAULT_PORT;
  const host = options.host || "0.0.0.0";
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      resolve({ server, app, port: server.address().port });
    });
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  start().then(({ port }) => {
    console.log(`ITDR Phase 2 http://127.0.0.1:${port}/itdr`);
  });
}
