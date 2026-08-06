import { describe, expectTypeOf, it } from "vitest";

import type { DayPlannerToastResult } from "../../src/app/day-planner-toast";
import type { ActualCalendarSyncResult } from "../../src/app/hooks/use-actual-calendar-sync";
import type { EditableEventsResult } from "../../src/app/hooks/use-editable-events";

describe("extracted hook contracts", () => {
  it("publishes explicit result types", () => {
    expectTypeOf<EditableEventsResult>().toHaveProperty("editorState");
    expectTypeOf<EditableEventsResult>().toHaveProperty(
      "openNewActualEditor",
    );
    expectTypeOf<EditableEventsResult>().toHaveProperty("openEventEditor");
    expectTypeOf<EditableEventsResult>().toHaveProperty("saveEditorDraft");
    expectTypeOf<EditableEventsResult>().toHaveProperty("deleteEditorEvent");
    expectTypeOf<EditableEventsResult>().toHaveProperty("closeEditor");
    expectTypeOf<EditableEventsResult>().toHaveProperty(
      "resizeEvent",
    );
    expectTypeOf<EditableEventsResult>().toHaveProperty("applyEventDrop");
    expectTypeOf<ActualCalendarSyncResult>().toHaveProperty(
      "isSavingActualsToCalendar",
    );
    expectTypeOf<DayPlannerToastResult>().toHaveProperty("current");
  });
});
