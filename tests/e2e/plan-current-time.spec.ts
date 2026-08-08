import { chromium, expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getExtensionLaunchOptions } from "./extension-launch-options";

async function createConnectedExtension() {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "plan-current-time-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";
import { createRuntimeMessageHandlers } from "./runtime-message-handlers.js";

registerServiceWorker(createRuntimeMessageHandlers({
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async () => ({ ok: true, value: { timeZone: "America/Los_Angeles", events: [] } }),
}, { now: () => new Date("2026-07-15T19:00:00.000Z") }));
`,
  );
  return extensionPath;
}

test("tracks current time without taking over the sticky viewport", async () => {
  const extensionPath = await createConnectedExtension();
  const context = await chromium.launchPersistentContext("", {
    ...getExtensionLaunchOptions(),
    viewport: { width: 900, height: 600 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  try {
    const serviceWorker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const extensionId = serviceWorker.url().split("/")[2];
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-07-15T12:00:00-07:00") });
    await page.goto(`chrome-extension://${extensionId}/index.html`);

    const viewport = page.getByTestId("plan-scroll-viewport");
    const header = page.getByTestId("day-grid-header");
    const indicator = page.getByTestId("plan-now-indicator");
    await expect(indicator).toHaveCSS("top", "420px");
    await expect(indicator).toContainText("12:00 PM");

    const indicatorSpan = await page.evaluate(() => {
      const axis = document.querySelector('[data-testid="day-grid-axis"]');
      const body = document.querySelector('[data-testid="day-grid-body"]');
      const nowLine = document.querySelector(
        '[data-testid="plan-now-indicator"]',
      );
      if (
        !(axis instanceof HTMLElement) ||
        !(body instanceof HTMLElement) ||
        !(nowLine instanceof HTMLElement)
      ) {
        return null;
      }
      return {
        axisRight: axis.getBoundingClientRect().right,
        bodyRight: body.getBoundingClientRect().right,
        lineLeft: nowLine.getBoundingClientRect().left,
        lineRight: nowLine.getBoundingClientRect().right,
      };
    });
    expect(indicatorSpan).not.toBeNull();
    expect(indicatorSpan!.lineLeft).toBeCloseTo(indicatorSpan!.axisRight, 0);
    expect(indicatorSpan!.lineRight).toBeCloseTo(indicatorSpan!.bodyRight, 0);

    const initialViewport = await viewport.boundingBox();
    const initialIndicator = await indicator.boundingBox();
    expect(initialViewport).not.toBeNull();
    expect(initialIndicator).not.toBeNull();
    expect(
      (initialIndicator!.y - initialViewport!.y) / initialViewport!.height,
    ).toBeCloseTo(0.3, 1);

    const headerTop = (await header.boundingBox())!.y;
    const dividerDifference = await page.evaluate(() => {
      const headerAxis = document.querySelector(
        '[data-testid="day-grid-header-axis"]',
      );
      const bodyAxis = document.querySelector('[data-testid="day-grid-axis"]');
      if (!(headerAxis instanceof HTMLElement) || !(bodyAxis instanceof HTMLElement)) {
        return Number.POSITIVE_INFINITY;
      }
      return Math.abs(
        headerAxis.getBoundingClientRect().right -
          bodyAxis.getBoundingClientRect().right,
      );
    });
    expect(dividerDifference).toBeLessThanOrEqual(1);

    await viewport.evaluate((element) => {
      element.scrollTop += 100;
    });
    await expect.poll(async () => (await header.boundingBox())!.y).toBe(headerTop);

    await viewport.evaluate((element) => {
      element.scrollTop = 50;
    });
    await page.clock.fastForward(60_000);
    await expect(indicator).toHaveCSS("top", "421.4px");
    await expect(indicator).toContainText("12:01 PM");
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(50);

    await page.clock.setSystemTime(new Date("2026-07-15T22:00:00-07:00"));
    await page.clock.fastForward(60_000);
    await expect(indicator).toHaveCount(0);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
