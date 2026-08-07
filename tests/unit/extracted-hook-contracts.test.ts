import { describe, expectTypeOf, it } from "vitest";

import type { DayPlannerToastResult } from "../../src/app/hooks/use-day-planner-toast";
import type { ActualsToCalendarSaveResult } from "../../src/app/hooks/use-save-actuals-to-calendar";
import type { EditableEventController } from "../../src/app/hooks/use-editable-event-controller";

describe("extracted hook contracts", () => {
  it("publishes explicit result types", () => {
    expectTypeOf<EditableEventController>().toHaveProperty("editorState");
    expectTypeOf<EditableEventController>().toHaveProperty(
      "openNewActualEditor",
    );
    expectTypeOf<EditableEventController>().toHaveProperty("openEventEditor");
    expectTypeOf<EditableEventController>().toHaveProperty("saveEditorDraft");
    expectTypeOf<EditableEventController>().toHaveProperty("deleteEditorEvent");
    expectTypeOf<EditableEventController>().toHaveProperty("closeEditor");
    expectTypeOf<EditableEventController>().toHaveProperty(
      "resizeEvent",
    );
    expectTypeOf<EditableEventController>().toHaveProperty("applyEventDrop");
    expectTypeOf<ActualsToCalendarSaveResult>().toHaveProperty(
      "isSavingActualsToCalendar",
    );
    expectTypeOf<DayPlannerToastResult>().toHaveProperty("current");
  });
});
