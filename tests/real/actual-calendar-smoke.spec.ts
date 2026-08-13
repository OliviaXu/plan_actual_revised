import { expect, test } from "@playwright/test";

import { createActualCalendarSmokeIds } from "./actual-calendar-smoke-data";
import {
  connectToRealExtension,
  requireConnectedCalendar,
} from "./real-browser";

test("real Calendar Actual insert is duplicate-safe and carries private metadata", async () => {
  const { blockId, eventId } = createActualCalendarSmokeIds();
  const { context, extensionId } = await connectToRealExtension();
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await requireConnectedCalendar(page);

  const testData = await page.evaluate(async ({ blockId }) => {
    const now = new Date();
    const calendarResponse = await chrome.runtime.sendMessage({
      type: "calendar.listEvents",
    });
    if (!calendarResponse.ok) {
      throw new Error("Unable to load the canonical Calendar day.");
    }
    const { date, timeZone } = calendarResponse.value;
    const key = `dayRecord:${date}`;
    const stored = await chrome.storage.local.get(key);
    return {
      key,
      original: stored[key],
      record: {
        schemaVersion: 1,
        date,
        timezone: timeZone,
        actual: [{
          id: blockId,
          summary: `[PAR real smoke ${date}]`,
          startMinutes: Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) * 5,
          durationMinutes: 30,
          colorId: "8",
          saveDisposition: "unsaved",
        }],
        updatedAt: now.toISOString(),
      },
    };
  }, { blockId });

  try {
    await page.evaluate(({ key, record }) => chrome.storage.local.set({ [key]: record }), testData);
    await page.reload();
    await page.getByRole("button", { name: "Save to Calendar" }).click();
    await expect(page.getByTestId("calendar-save-toast")).toContainText("Saved 1 Actual");

    await page.evaluate(({ key, record }) => chrome.storage.local.set({ [key]: record }), testData);
    await page.reload();
    await page.getByRole("button", { name: "Save to Calendar" }).click();
    await expect(page.getByTestId("calendar-save-toast")).toContainText("Saved 1 Actual");

    const event = await page.evaluate(async (eventId) => {
      const { token } = await chrome.identity.getAuthToken({ interactive: false });
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return response.json();
    }, eventId);
    expect(event.extendedProperties?.private).toMatchObject({
      planActualRevisedActual: "true",
    });
  } finally {
    await page.evaluate(async ({ key, original, eventId }) => {
      const { token } = await chrome.identity.getAuthToken({ interactive: false });
      if (token) {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
        );
      }
      if (original === undefined) await chrome.storage.local.remove(key);
      else await chrome.storage.local.set({ [key]: original });
    }, { ...testData, eventId });
    await page.close();
  }
});
