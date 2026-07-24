import { expect, chromium, test, type Locator } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type SeededEvent = {
  kind: "timed";
  id: string;
  summary: string;
  colorId: string | null;
  start: string;
  end: string;
  timeZone: string | null;
};

function event(
  id: string,
  start: string,
  end: string,
  colorId: string,
): SeededEvent {
  return {
    kind: "timed",
    id,
    summary: id,
    colorId,
    start,
    end,
    timeZone: "America/Los_Angeles",
  };
}

async function createSeededExtension(events: SeededEvent[]) {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "plan-overlap-extension-"),
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
    value: { timeZone: "America/Los_Angeles", events: ${JSON.stringify(events)} },
  }),
}, () => new Date("2026-07-15T19:00:00.000Z")));
`,
  );
  return extensionPath;
}

async function openExtension(extensionPath: string) {
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
  await page.goto(`chrome-extension://${extensionId}/index.html`);
  return { context, page };
}

async function expectOverlapLayout(
  block: Locator,
  expected: {
    group: string;
    layer: string;
    left: string;
    top: string;
    zIndex: string;
  },
) {
  await expect(block).toHaveAttribute(
    "data-overlap-group-index",
    expected.group,
  );
  await expect(block).toHaveAttribute("data-overlap-layer-index", expected.layer);
  await expect(block).toHaveCSS("left", expected.left);
  await expect(block).toHaveCSS("top", expected.top);
  await expect(block).toHaveCSS("z-index", expected.zIndex);
}

test("cascades overlap groups and supports transient click-to-front", async () => {
  const extensionPath = await createSeededExtension([
    event(
      "base",
      "2026-07-15T09:00:00-07:00",
      "2026-07-15T12:00:00-07:00",
      "1",
    ),
    event(
      "partial",
      "2026-07-15T09:30:00-07:00",
      "2026-07-15T10:30:00-07:00",
      "3",
    ),
    event(
      "nested",
      "2026-07-15T10:00:00-07:00",
      "2026-07-15T11:00:00-07:00",
      "5",
    ),
    event(
      "touching-reuse",
      "2026-07-15T10:30:00-07:00",
      "2026-07-15T11:30:00-07:00",
      "7",
    ),
    event(
      "boundary-touching",
      "2026-07-15T12:00:00-07:00",
      "2026-07-15T13:00:00-07:00",
      "9",
    ),
    event(
      "separate",
      "2026-07-15T14:00:00-07:00",
      "2026-07-15T15:00:00-07:00",
      "11",
    ),
  ]);
  const { context, page } = await openExtension(extensionPath);

  try {
    const base = page.locator('[data-calendar-event-id="base"]');
    const partial = page.locator('[data-calendar-event-id="partial"]');
    const nested = page.locator('[data-calendar-event-id="nested"]');
    const touchingReuse = page.locator(
      '[data-calendar-event-id="touching-reuse"]',
    );
    const boundaryTouching = page.locator(
      '[data-calendar-event-id="boundary-touching"]',
    );
    const separate = page.locator('[data-calendar-event-id="separate"]');

    await expectOverlapLayout(base, {
      group: "0",
      layer: "0",
      left: "12px",
      top: "168px",
      zIndex: "0",
    });
    await expectOverlapLayout(partial, {
      group: "0",
      layer: "1",
      left: "24px",
      top: "210px",
      zIndex: "1",
    });
    await expectOverlapLayout(nested, {
      group: "0",
      layer: "2",
      left: "36px",
      top: "252px",
      zIndex: "2",
    });
    await expectOverlapLayout(touchingReuse, {
      group: "0",
      layer: "1",
      left: "24px",
      top: "294px",
      zIndex: "1",
    });
    await expectOverlapLayout(boundaryTouching, {
      group: "1",
      layer: "0",
      left: "12px",
      top: "420px",
      zIndex: "0",
    });
    await expectOverlapLayout(separate, {
      group: "2",
      layer: "0",
      left: "12px",
      top: "588px",
      zIndex: "0",
    });

    const titleOffsetPx = await base.evaluate((block) => {
      const title = block.querySelector('[data-testid="plan-event-title"]');
      if (!(title instanceof HTMLElement)) {
        return Number.POSITIVE_INFINITY;
      }
      return title.getBoundingClientRect().top - block.getBoundingClientRect().top;
    });
    expect(titleOffsetPx).toBeLessThanOrEqual(3);

    await base.click({ position: { x: 4, y: 4 } });
    const clickedZIndex = Number(await base.evaluate((node) => getComputedStyle(node).zIndex));
    const nestedZIndex = Number(
      await nested.evaluate((node) => getComputedStyle(node).zIndex),
    );
    expect(clickedZIndex).toBeGreaterThan(nestedZIndex);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
