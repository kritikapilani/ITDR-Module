const LIVE_KEYS = [
  "procedureFollowed",
  "rtoMet",
  "rpoMet",
  "noManualIntervention",
  "contactsReachable",
  "dataLossBeyondRpo",
  "functionalChecksPassed",
  "outdatedSteps",
];

const TABLETOP_KEYS = ["rolesAgreed", "stepsIdentified", "contactsConfirmed", "planPlausible", "outdatedSteps"];

export function questionnaireKeys(exerciseMode) {
  return exerciseMode === "tabletop" ? TABLETOP_KEYS : LIVE_KEYS;
}

export function deriveTestOutcome(exerciseMode, answers = {}) {
  const a = answers || {};
  if (exerciseMode === "tabletop") {
    if (a.planPlausible === "no") return "fail";
    const answered = TABLETOP_KEYS.every((k) => a[k]);
    if (!answered) {
      if (a.outdatedSteps === "yes") return "partial";
      return "pending";
    }
    if (a.planPlausible === "yes" && a.outdatedSteps === "no") return "pass";
    if (a.outdatedSteps === "yes" || a.planPlausible === "unsure") return "partial";
    return "pending";
  }

  if (a.rtoMet === "no" || a.rpoMet === "no" || a.dataLossBeyondRpo === "yes") return "fail";
  const answered = LIVE_KEYS.every((k) => a[k]);
  if (!answered) {
    if (a.outdatedSteps === "yes" || a.procedureFollowed === "partial") return "partial";
    return "pending";
  }
  const rtoRpoMet = a.rtoMet === "yes" && a.rpoMet === "yes";
  if (!rtoRpoMet) return "fail";
  const unresolved =
    a.dataLossBeyondRpo === "yes" || a.functionalChecksPassed === "no" || a.outdatedSteps === "yes";
  if (rtoRpoMet && !unresolved && a.procedureFollowed !== "partial" && a.procedureFollowed !== "no") return "pass";
  if (rtoRpoMet && (a.outdatedSteps === "yes" || a.procedureFollowed === "partial" || a.procedureFollowed === "no" || a.functionalChecksPassed === "no")) {
    return "partial";
  }
  return "pending";
}
