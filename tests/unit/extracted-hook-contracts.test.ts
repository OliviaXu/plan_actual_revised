import { describe, expectTypeOf, it } from "vitest";

import type { DayPlannerToastResult } from "../../src/app/day-planner-toast";
import type { ActualCalendarSyncResult } from "../../src/app/hooks/use-actual-calendar-sync";
import type { EditableDayEventsResult } from "../../src/app/hooks/use-editable-day-events";

describe("extracted hook contracts", () => {
  it("publishes explicit result types", () => {
    expectTypeOf<EditableDayEventsResult>().toHaveProperty("editorState");
    expectTypeOf<EditableDayEventsResult>().toHaveProperty(
      "openNewActualEditor",
    );
    expectTypeOf<EditableDayEventsResult>().toHaveProperty("openEventEditor");
    expectTypeOf<EditableDayEventsResult>().toHaveProperty("saveEditorDraft");
    expectTypeOf<EditableDayEventsResult>().toHaveProperty("deleteEditorEvent");
    expectTypeOf<EditableDayEventsResult>().toHaveProperty("closeEditor");
    expectTypeOf<EditableDayEventsResult>().toHaveProperty(
      "resizeEditableEvent",
    );
    expectTypeOf<EditableDayEventsResult>().toHaveProperty("applyEventDrop");
    expectTypeOf<ActualCalendarSyncResult>().toHaveProperty(
      "isSavingActualsToCalendar",
    );
    expectTypeOf<DayPlannerToastResult>().toHaveProperty("current");
  });
});
