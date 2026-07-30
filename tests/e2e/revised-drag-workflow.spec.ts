import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("Plan copies into Actual and Revised survive reload", async () => {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "revised-drag-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";
import { createServiceWorkerOperations } from "./compose-service-worker.js";

registerServiceWorker(createServiceWorkerOperations({
  openAppPage: () => chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async () => ({
    ok: true,
    value: {
      timeZone: "America/Los_Angeles",
      events: [{
        kind: "timed",
        id: "design-review",
        summary: "Design review",
        colorId: "9",
        start: "2026-07-15T09:00:00-07:00",
        end: "2026-07-15T10:00:00-07:00",
        timeZone: "America/Los_Angeles",
      }],
    },
  }),
}, () => new Date("2026-07-15T19:00:00.000Z")));
`,
  );
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = serviceWorker.url().split("/")[2];
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date("2026-07-15T12:00:00-07:00"));

  try {
    await page.goto(`chrome-extension://${extensionId}/index.html`);
    const plan = page.getByTestId("plan-event-design-review");
    await expect(plan).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Actual" }))
      .toBeEnabled();
    await page.getByTestId("plan-scroll-viewport").evaluate((element) => {
      element.scrollTop = 200;
    });

    await plan.dragTo(page.getByTestId("actual-column"), {
      sourcePosition: { x: 20, y: 42 },
      targetPosition: { x: 80, y: 399 },
    });
    await expect(page.getByTestId("actual-block")).toContainText(
      "Design review",
    );
    await plan.dragTo(page.getByTestId("revised-column"), {
      sourcePosition: { x: 20, y: 42 },
      targetPosition: { x: 80, y: 483 },
    });

    await expect
      .poll(() =>
        page.evaluate(async () => {
          const stored = await chrome.storage.local.get(
            "dayRecord:2026-07-15",
          );
          return stored["dayRecord:2026-07-15"];
        }),
      )
      .toMatchObject({
        schemaVersion: 1,
        actual: [{
          summary: "Design review",
          startMinutes: 675,
          durationMinutes: 60,
          colorId: "9",
          sourceCalendarEventId: "design-review",
          saveDisposition: "unsaved",
        }],
        revised: [{
          summary: "Design review",
          startMinutes: 735,
          durationMinutes: 60,
          colorId: "9",
          sourceCalendarEventId: "design-review",
        }],
      });

    const copyIds = await page.evaluate(async () => {
      const stored = await chrome.storage.local.get(
        "dayRecord:2026-07-15",
      );
      const record = stored["dayRecord:2026-07-15"] as {
        actual: Array<{ id: string }>;
        revised: Array<{ id: string }>;
      };
      return [record.actual[0]?.id, record.revised[0]?.id];
    });
    expect(copyIds[0]).toBeTruthy();
    expect(copyIds[1]).toBeTruthy();
    expect(copyIds[0]).not.toBe(copyIds[1]);

    await page.reload();
    await expect(page.getByTestId("actual-block")).toContainText(
      "Design review",
    );
    await expect(page.getByTestId("revised-block")).toContainText(
      "Design review",
    );
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
