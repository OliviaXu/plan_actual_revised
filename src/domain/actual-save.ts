import type { ActualEvent, PlanEvent } from "./day-event";

export function isExactPlanMatch(
  actual: ActualEvent,
  plan: PlanEvent,
) {
  return (
    plan.summary === actual.summary &&
    plan.startMinutes === actual.startMinutes &&
    plan.durationMinutes === actual.durationMinutes &&
    plan.colorId === actual.colorId
  );
}
