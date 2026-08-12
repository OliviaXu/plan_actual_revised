import { expect, test, type Page } from "@playwright/test";

import {
  connectToRealExtension,
  requireConnectedCalendar,
} from "./real-browser";

test("real Calendar weekly practice can be recreated after manual deletion", async () => {
  const { context, extensionId } = await connectToRealExtension();
  const page = await context.newPage();
  const runId = Date.now();
  const firstSummary = `[PAR real practice smoke ${runId} first]`;
  const replacementSummary = `[PAR real practice smoke ${runId} replacement]`;
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  await requireConnectedCalendar(page);

  try {
    const input = page.getByPlaceholder("practice");
    await expect(input).toBeVisible();

    await input.fill(firstSummary);
    await input.press("Enter");
    await expect(page.getByText(firstSummary)).toBeVisible();
    await expect(page.getByTestId("weekly-practice-toast")).toHaveText(
      "Weekly practice saved to calendar",
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

async function deleteCalendarEventBySummary(page: Page, summary: string) {
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
