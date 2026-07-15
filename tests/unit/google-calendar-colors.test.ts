import { describe, expect, it } from "vitest";

import {
  GOOGLE_CALENDAR_EVENT_COLOR_CLASS_NAMES,
  PLAN_EVENT_NEUTRAL_COLOR_CLASS_NAME,
  planEventColorClassName,
} from "../../src/design/google-calendar-colors";

describe("Google Calendar event color tokens", () => {
  it("centralizes the eleven event-color IDs", () => {
    expect(GOOGLE_CALENDAR_EVENT_COLOR_CLASS_NAMES).toEqual({
      "1": "border-[#7986cb]/50 bg-[#7986cb]/25",
      "2": "border-[#33b679]/50 bg-[#33b679]/25",
      "3": "border-[#8e24aa]/50 bg-[#8e24aa]/25",
      "4": "border-[#e67c73]/50 bg-[#e67c73]/25",
      "5": "border-[#f6c026]/50 bg-[#f6c026]/25",
      "6": "border-[#f5511d]/50 bg-[#f5511d]/25",
      "7": "border-[#039be5]/50 bg-[#039be5]/25",
      "8": "border-[#616161]/50 bg-[#616161]/25",
      "9": "border-[#3f51b5]/50 bg-[#3f51b5]/25",
      "10": "border-[#0b8043]/50 bg-[#0b8043]/25",
      "11": "border-[#d60000]/50 bg-[#d60000]/25",
    });
  });

  it("uses the neutral token when there is no recognized event override", () => {
    expect(planEventColorClassName(null)).toBe(
      PLAN_EVENT_NEUTRAL_COLOR_CLASS_NAME,
    );
    expect(planEventColorClassName("unknown")).toBe(
      PLAN_EVENT_NEUTRAL_COLOR_CLASS_NAME,
    );
    expect(planEventColorClassName("toString")).toBe(
      PLAN_EVENT_NEUTRAL_COLOR_CLASS_NAME,
    );
    expect(planEventColorClassName("1")).toBe(
      GOOGLE_CALENDAR_EVENT_COLOR_CLASS_NAMES["1"],
    );
  });
});
