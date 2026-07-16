import { expect, chromium, test } from "@playwright/test";
import path from "node:path";

const BLOCK_ID = "0a1b2c3d-4e5f-6789-abcd-0123456789ab";
const EVENT_ID = `par${BLOCK_ID.replaceAll("-", "")}`;

test("real Calendar Actual insert is duplicate-safe and carries private metadata", async () => {
  const profileDirectory = process.env.REAL_CALENDAR_PROFILE_DIR;
  if (!profileDirectory) {
    throw new Error("Set REAL_CALENDAR_PROFILE_DIR to a dedicated Chrome profile directory.");
  }

  const context = await chromium.launchPersistentContext(profileDirectory, {
    headless: false,
    args: [
      `--disable-extensions-except=${path.resolve("dist")}`,
      `--load-extension=${path.resolve("dist")}`,
    ],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionId = worker.url().split("/")[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/index.html`);

  const testData = await page.evaluate(({ blockId }) => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const key = `dayRecord:${date}`;
    return chrome.storage.local.get(key).then((stored) => ({
      key,
      original: stored[key],
      record: {
        schemaVersion: 1,
        date,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
    }));
  }, { blockId: BLOCK_ID });

  try {
    const connect = page.getByRole("button", { name: "Connect Calendar" });
    if (await connect.isVisible()) {
      await connect.click();
      await expect(connect).toHaveCount(0, { timeout: 90_000 });
    }

    await page.evaluate(({ key, record }) => chrome.storage.local.set({ [key]: record }), testData);
    await page.reload();
    await page.getByRole("button", { name: "Save Actual to calendar" }).click();
    await expect(page.getByTestId("actual-save-summary")).toContainText("Saved 1");

    await page.evaluate(({ key, record }) => chrome.storage.local.set({ [key]: record }), testData);
    await page.reload();
    await page.getByRole("button", { name: "Save Actual to calendar" }).click();
    await expect(page.getByTestId("actual-save-summary")).toContainText("Saved 1");

    const event = await page.evaluate(async (eventId) => {
      const { token } = await chrome.identity.getAuthToken({ interactive: false });
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return response.json();
    }, EVENT_ID);
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
    }, { ...testData, eventId: EVENT_ID });
    await context.close();
  }
});
