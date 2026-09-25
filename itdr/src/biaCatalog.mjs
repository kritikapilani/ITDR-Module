import { mostDemandingObjectives } from "./contracts.mjs";
import { clone, fail } from "./httpError.mjs";

const TENANT = "tenant-demo";

function seedApplications() {
  return [
    {
      biaApplicationId: "bia-app-payments",
      name: "Payments Gateway",
      tenantId: TENANT,
      criticality: "high",
      tier: 1,
      inScope: true,
      processes: [
        { processId: "proc-settle", name: "Settlement", rtoMinutes: 240, rpoMinutes: 15 },
        { processId: "proc-auth", name: "Authorization", rtoMinutes: 120, rpoMinutes: 5 },
      ],
    },
    {
      biaApplicationId: "bia-app-hr",
      name: "HR Portal",
      tenantId: TENANT,
      criticality: "medium",
      tier: 2,
      inScope: true,
      processes: [{ processId: "proc-payroll", name: "Payroll", rtoMinutes: 1440, rpoMinutes: 60 }],
    },
    {
      biaApplicationId: "bia-app-wiki",
      name: "Internal Wiki",
      tenantId: TENANT,
      criticality: "low",
      tier: 3,
      inScope: true,
      processes: [{ processId: "proc-knowledge", name: "Knowledge access", rtoMinutes: null, rpoMinutes: null }],
    },
  ];
}

function seedBcp() {
  return [
    {
      planId: "bcp-1",
      planType: "BCP",
      versionId: "bcp-1-v3",
      title: "Payments business continuity plan",
      ownerUserId: "user-bcm",
      status: "approved",
      links: [
        { processId: "proc-settle", assetId: "ci-pay-app", applicationId: "bia-app-payments" },
        { processId: "proc-auth", assetId: "ci-pay-app", applicationId: "bia-app-payments" },
      ],
    },
  ];
}

export function createBiaCatalog() {
  const applications = seedApplications();
  const bcpPlans = seedBcp();
  let lastReadAt = new Date().toISOString();
  let available = true;

  function find(id) {
    return applications.find((a) => a.biaApplicationId === id) || null;
  }

  return {
    tenantId: TENANT,
    isAvailable: () => available,
    setAvailable(value) {
      available = Boolean(value);
    },
    lastReadAt: () => lastReadAt,
    listCached(tenantId) {
      return applications
        .filter((app) => app.tenantId === tenantId)
        .map((app) => ({
          ...clone(app),
          inheritedObjectives: mostDemandingObjectives(app.processes),
        }));
    },
    list(tenantId) {
      if (!available) fail(503, "BIA temporarily unavailable", "BIA_UNAVAILABLE");
      lastReadAt = new Date().toISOString();
      return this.listCached(tenantId).filter((app) => app.inScope);
    },
    get(id) {
      if (!available) fail(503, "BIA temporarily unavailable", "BIA_UNAVAILABLE");
      lastReadAt = new Date().toISOString();
      const app = find(id);
      if (!app || !app.inScope) return null;
      return { ...clone(app), inheritedObjectives: mostDemandingObjectives(app.processes) };
    },
    getIncludingOutOfScope(id) {
      const app = find(id);
      return app ? { ...clone(app), inheritedObjectives: mostDemandingObjectives(app.processes) } : null;
    },
    upsert(body) {
      if (!body?.biaApplicationId) fail(400, "biaApplicationId is required", "D2");
      let app = find(body.biaApplicationId);
      if (!app) {
        app = {
          biaApplicationId: body.biaApplicationId,
          name: body.name || body.biaApplicationId,
          tenantId: body.tenantId || TENANT,
          criticality: body.criticality || null,
          tier: body.tier ?? null,
          inScope: body.inScope !== false,
          processes: body.processes || [],
        };
        applications.push(app);
      } else {
        Object.assign(app, {
          name: body.name ?? app.name,
          criticality: body.criticality ?? app.criticality,
          tier: body.tier ?? app.tier,
          inScope: body.inScope ?? app.inScope,
          processes: body.processes ?? app.processes,
        });
      }
      return this.getIncludingOutOfScope(app.biaApplicationId);
    },
    listBcp(biaApplicationId) {
      return bcpPlans.filter((plan) => plan.links.some((link) => link.applicationId === biaApplicationId)).map(clone);
    },
    allIds() {
      return applications.map((a) => a.biaApplicationId);
    },
  };
}
