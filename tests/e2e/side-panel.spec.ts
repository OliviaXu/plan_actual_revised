import { expect, chromium, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getExtensionLaunchOptions } from "./extension-launch-options";

async function loadExtension(extensionPath: string) {
  const context = await chromium.launchPersistentContext("", {
    ...getExtensionLaunchOptions(),
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  const serviceWorker =
    context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extensionId = serviceWorker.url().split("/")[2];
  return { context, extensionId, serviceWorker };
}

test("the real extension action opens the panel from a Calendar tab", async () => {
  test.skip(
    getExtensionLaunchOptions().headless,
    "Chromium only creates its browser-owned side panel UI in headed mode",
  );

  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "side-panel-gesture-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  const { context, extensionId, serviceWorker } = await loadExtension(extensionPath);
  const page = await context.newPage();

  try {
    await page.route("https://calendar.google.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<title>Calendar</title>" }),
    );
    await page.goto("https://calendar.google.com/calendar/u/0/r");

    const browser = context.browser();
    if (!browser) {
      throw new Error("Persistent Chromium context has no browser connection");
    }
    const browserSession = await browser.newBrowserCDPSession();
    const tabTargetFilter = [
      { type: "tab", exclude: false },
      { exclude: true },
    ];
    await browserSession.send("Target.setDiscoverTargets", {
      discover: true,
      filter: tabTargetFilter,
    });
    const { targetInfos } = await browserSession.send("Target.getTargets", {
      filter: tabTargetFilter,
    });
    const calendarTabTarget = targetInfos.find(
      (target) =>
        target.type === "tab" &&
        target.url.startsWith("https://calendar.google.com/"),
    );
    if (!calendarTabTarget) {
      throw new Error(
        `Chrome did not expose the Calendar tab target: ${JSON.stringify(targetInfos)}`,
      );
    }
    const calendarTabId = await serviceWorker.evaluate(async () => {
      const calendarTab = (await chrome.tabs.query({})).find((tab) =>
        tab.url?.startsWith("https://calendar.google.com/")
      );
      if (calendarTab?.id === undefined) {
        throw new Error("Chrome did not expose the Calendar tab to the extension");
      }
      return calendarTab.id;
    });
    await browserSession.send("Extensions.triggerAction", {
      id: extensionId,
      targetId: calendarTabTarget.targetId,
    });

    await expect.poll(() => serviceWorker.evaluate(async (tabId) =>
      (await chrome.sidePanel.getOptions({ tabId })).path,
    calendarTabId)).toMatch(/^side-panel\.html\?refresh=/);

    await expect.poll(() => serviceWorker.evaluate(async (id) => {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["SIDE_PANEL"],
      });
      return contexts.some((context) =>
        context.documentUrl?.startsWith(`chrome-extension://${id}/side-panel.html`)
      );
    }, extensionId)).toBe(true);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("side panel progressively reveals columns without resetting its timeline", async () => {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "responsive-side-panel-extension-"),
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
  const { context, extensionId } = await loadExtension(extensionPath);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __slackAttempts?: Array<{
        active: boolean;
        target: string;
        url: string;
      }>;
    };
    state.__slackAttempts = [];
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL, windowTarget: string) => {
        state.__slackAttempts?.push({
          active: navigator.userActivation?.isActive ?? false,
          target: windowTarget,
          url: String(url),
        });
        return window;
      },
    });
  });
  await page.clock.setFixedTime(new Date("2026-07-15T12:00:00-07:00"));

  try {
    await page.setViewportSize({ width: 519, height: 800 });
    await page.goto(`chrome-extension://${extensionId}/side-panel.html`);

    await expect(page.locator("main")).toHaveAttribute(
      "data-app-surface",
      "side-panel",
    );
    await expect(page.getByRole("heading", { name: "Actual", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Plan", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Revised", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("revised-reveal-header")).toHaveText("R");
    await expect(page.getByTestId("revised-reveal-rail")).toHaveAttribute(
      "title",
      "Drag the side panel wider to show Revised",
    );
    await expect(page.getByRole("button", { name: "Add Actual" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Log Slack time" })).toBeEnabled();

    await page.getByRole("button", { name: "Log Slack time" }).click();
    await page
      .getByPlaceholder("attention is devotion :)")
      .fill("Panel Slack check");
    await page.getByRole("button", { name: "Open Slack" }).click();
    expect(await page.evaluate(() =>
      (window as typeof window & { __slackAttempts?: unknown[] })
        .__slackAttempts,
    )).toEqual([{
      active: true,
      target: "_blank",
      url: "slack://open",
    }]);

    await page.getByRole("button", { name: "Add Actual" }).click();
    await page.getByRole("textbox", { name: "Title" }).fill("Panel Actual");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByTestId("actual-block").filter({ hasText: "Panel Actual" }),
    ).toContainText("Panel Actual");

    const viewport = page.getByTestId("plan-scroll-viewport");
    await viewport.evaluate((element) => {
      element.scrollTop = 240;
    });
    await page.setViewportSize({ width: 520, height: 800 });

    await expect(page.getByRole("heading", { name: "Revised", exact: true })).toBeVisible();
    await expect(page.getByTestId("plan-reveal-header")).toHaveText("P");
    await expect(page.getByTestId("plan-reveal-rail")).toHaveAttribute(
      "title",
      "Drag the side panel wider to show Plan",
    );
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop))
      .toBe(240);

    await page.setViewportSize({ width: 1023, height: 800 });

    await expect(page.getByRole("heading", { name: "Plan", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("plan-reveal-header")).toHaveText("P");

    await page.setViewportSize({ width: 1024, height: 800 });

    await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
    await expect(page.getByTestId("plan-event-design-review")).toBeVisible();
    await expect(page.getByTestId("plan-reveal-rail")).toHaveCount(0);
    await expect(page.getByTestId("revised-reveal-rail")).toHaveCount(0);
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop))
      .toBe(240);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
