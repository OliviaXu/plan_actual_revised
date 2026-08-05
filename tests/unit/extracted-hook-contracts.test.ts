import { describe, expectTypeOf, it } from "vitest";

import type { DayPlannerToastResult } from "../../src/app/day-planner-toast";
import type { ActualCalendarSyncResult } from "../../src/app/hooks/use-actual-calendar-sync";
import type { EditableDayEventsResult } from "../../src/app/hooks/use-editable-day-events";

describe("extracted hook contracts", () => {
  it("publishes explicit result types", () => {
    expectTypeOf<EditableDayEventsResult>().toHaveProperty("editorState");
    expectTypeOf<ActualCalendarSyncResult>().toHaveProperty(
      "isSavingActualsToCalendar",
    );
    expectTypeOf<DayPlannerToastResult>().toHaveProperty("current");
  });
});
