import { expect, chromium, test } from "@playwright/test";
import path from "node:path";

test("real Calendar daily focus persists across an extension reload", async () => {
  const profileDirectory = process.env.REAL_CALENDAR_PROFILE_DIR;
  if (!profileDirectory) {
    throw new Error(
      "Set REAL_CALENDAR_PROFILE_DIR to a dedicated Chrome profile directory.",
    );
  }

  const context = await chromium.launchPersistentContext(profileDirectory, {
    headless: false,
    args: [
      `--disable-extensions-except=${path.resolve("dist")}`,
      `--load-extension=${path.resolve("dist")}`,
    ],
  });
  const worker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = worker.url().split("/")[2];
  const page = await context.newPage();
  const summary = `[PAR real focus smoke ${Date.now()}]`;
  await page.goto(`chrome-extension://${extensionId}/index.html`);

  try {
    const connect = page.getByRole("button", { name: "Connect Calendar" });
    if (await connect.isVisible()) {
      await connect.click();
      await expect(connect).toHaveCount(0, { timeout: 90_000 });
    }

    const input = page.getByPlaceholder("struggling is how learning happens");
    if (await input.count() === 0) {
      throw new Error(
        "The dedicated profile already has a daily focus for today; remove it before running this smoke test.",
      );
    }

    await input.fill(summary);
    await input.press("Enter");
    await expect(page.getByText(summary)).toBeVisible();
    await expect(page.getByTestId("daily-focus-toast")).toHaveText(
      "Daily focus saved to calendar",
    );

    await page.reload();
    await expect(page.getByText(summary)).toBeVisible();
  } finally {
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
    await context.close();
  }
});
