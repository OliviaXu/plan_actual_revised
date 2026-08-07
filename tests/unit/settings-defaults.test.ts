import { describe, expect, it } from "vitest";

import { defaultSettings } from "../../src/config/settings";

describe("defaultSettings", () => {
  it("provides the MVP day-grid defaults from the PRD", () => {
    expect(defaultSettings).toMatchObject({
      dayStartHour: 7,
      dayEndHour: 21,
      pixelsPerMinute: 1.4,
      snapMinutes: 5,
      hiddenPlanColorIds: ["2", "10"],
      actualPaletteColorIds: ["11", "6", "1"],
    });
  });
});
