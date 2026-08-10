import { expect, it } from "vitest";

import { createActualCalendarSmokeIds } from "../real/actual-calendar-smoke-data";

it("creates a fresh deterministic Calendar event ID for each smoke invocation", () => {
  const first = createActualCalendarSmokeIds();
  const second = createActualCalendarSmokeIds();

  expect(first.blockId).not.toBe(second.blockId);
  expect(first.eventId).toBe(`par${first.blockId.replaceAll("-", "")}`);
  expect(second.eventId).toBe(`par${second.blockId.replaceAll("-", "")}`);
});
