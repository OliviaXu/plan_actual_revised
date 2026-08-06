import type { EditableEvent, PlanEvent } from "./day-event";

export function copyPlanEvent(
  planEvent: PlanEvent,
  startMinutes: number,
  id: string,
): EditableEvent {
  return {
    id,
    summary: planEvent.summary,
    startMinutes,
    durationMinutes: planEvent.durationMinutes,
    colorId: planEvent.colorId,
    sourceCalendarEventId: planEvent.id,
  };
}
