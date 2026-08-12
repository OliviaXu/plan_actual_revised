import { expect, test } from "@playwright/test";

import {
  connectToRealExtension,
  requireConnectedCalendar,
} from "./real-browser";

test("real Calendar daily focus can be recreated after manual deletion", async () => {
  const { context, extensionId } = await connectToRealExtension();
  const page = await context.newPage();
  const runId = Date.now();
  const firstSummary = `[PAR real focus smoke ${runId} first]`;
  const replacementSummary = `[PAR real focus smoke ${runId} replacement]`;
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await requireConnectedCalendar(page);

  try {
    const input = page.getByPlaceholder("eat the frog");
    if (await input.count() === 0) {
      throw new Error(
        "The dedicated profile already has a daily focus for today; remove it before running this smoke test.",
      );
    }

    await input.fill(firstSummary);
    await input.press("Enter");
    await expect(page.getByText(firstSummary)).toBeVisible();
    await expect(page.getByTestId("daily-focus-toast")).toHaveText(
      "Daily focus saved to calendar",
    );

    await deleteCalendarEventBySummary(page, firstSummary);
    await page.reload();
    await expect(input).toBeVisible();

    await input.fill(replacementSummary);
    await input.press("Enter");
    await expect(page.getByText(replacementSummary)).toBeVisible();
    await page.reload();
    await expect(page.getByText(replacementSummary)).toBeVisible();
  } finally {
    await deleteCalendarEventBySummary(page, firstSummary);
    await deleteCalendarEventBySummary(page, replacementSummary);
    await page.close();
  }
});

async function deleteCalendarEventBySummary(
  page: import("@playwright/test").Page,
  summary: string,
) {
  await page.evaluate(async (testSummary) => {
    const { token } = await chrome.identity.getAuthToken({ interactive: false });
    if (!token) return;

    const url = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    url.searchParams.set("q", testSummary);
    url.searchParams.set("singleEvents", "true");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    const body = await response.json();
    const event = body.items?.find(
      (item: { id?: string; summary?: string }) =>
        item.summary === testSummary && typeof item.id === "string",
    );
    if (event?.id) {
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
    }
  }, summary);
}
