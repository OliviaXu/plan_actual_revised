import { describe, expect, it } from "vitest";

import {
  GOOGLE_CALENDAR_EVENT_COLORS,
  resolveGoogleCalendarEventColor,
} from "../../src/calendar/google-calendar-colors";

describe("Google Calendar event colors", () => {
  it("centralizes the eleven provider event-color IDs as color data", () => {
    expect(GOOGLE_CALENDAR_EVENT_COLORS).toEqual({
      "1": "#7986cb",
      "2": "#33b679",
      "3": "#8e24aa",
      "4": "#e67c73",
      "5": "#f6c026",
      "6": "#f5511d",
      "7": "#039be5",
      "8": "#616161",
      "9": "#3f51b5",
      "10": "#0b8043",
      "11": "#d60000",
    });
  });

  it("resolves only explicit recognized event overrides", () => {
    expect(resolveGoogleCalendarEventColor("6")).toBe("#f5511d");
    expect(resolveGoogleCalendarEventColor(null)).toBeNull();
    expect(resolveGoogleCalendarEventColor("unknown")).toBeNull();
    expect(resolveGoogleCalendarEventColor("toString")).toBeNull();
  });
});
