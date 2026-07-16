import { describe, expect, it } from "vitest";

import {
  GOOGLE_CALENDAR_EVENT_COLOR_CLASS_NAMES,
  PLAN_EVENT_NEUTRAL_COLOR_CLASS_NAME,
  planEventColorClassName,
} from "../../src/design/google-calendar-colors";

describe("Google Calendar event color tokens", () => {
  it("centralizes the eleven event-color IDs", () => {
    expect(GOOGLE_CALENDAR_EVENT_COLOR_CLASS_NAMES).toEqual({
      "1": "border-[#7986cb]/50 bg-[#dee1f2]",
      "2": "border-[#33b679]/50 bg-[#ccedde]",
      "3": "border-[#8e24aa]/50 bg-[#e3c8ea]",
      "4": "border-[#e67c73]/50 bg-[#f9dedc]",
      "5": "border-[#f6c026]/50 bg-[#fdf0c9]",
      "6": "border-[#f5511d]/50 bg-[#fdd4c7]",
      "7": "border-[#039be5]/50 bg-[#c0e6f9]",
      "8": "border-[#616161]/50 bg-[#d8d8d8]",
      "9": "border-[#3f51b5]/50 bg-[#cfd4ec]",
      "10": "border-[#0b8043]/50 bg-[#c2dfd0]",
      "11": "border-[#d60000]/50 bg-[#f5bfbf]",
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
