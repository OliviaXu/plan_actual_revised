import { describe, expect, it } from "vitest";

import { copyPlanEvent } from "../../src/domain/editable-event-drag";

describe("copyPlanEvent", () => {
  it("copies editable fields and records Plan provenance under a fresh ID", () => {
    expect(copyPlanEvent(
      {
        id: "calendar-source",
        summary: "Design review",
        startMinutes: 540,
        durationMinutes: 60,
        colorId: "9",
      },
      675,
      "local-copy",
    )).toEqual({
      id: "local-copy",
      summary: "Design review",
      startMinutes: 675,
      durationMinutes: 60,
      colorId: "9",
      sourceCalendarEventId: "calendar-source",
    });
  });
});
