import { describe, expectTypeOf, it } from "vitest";

import type { DayPlannerToastResult } from "../../src/app/hooks/use-day-planner-toast";
import type { ActualsToCalendarSaveResult } from "../../src/app/hooks/use-save-actuals-to-calendar";
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
    expectTypeOf<ActualsToCalendarSaveResult>().toHaveProperty(
      "isSavingActualsToCalendar",
    );
    expectTypeOf<DayPlannerToastResult>().toHaveProperty("current");
  });
});
