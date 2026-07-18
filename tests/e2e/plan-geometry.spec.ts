import { expect, chromium, test, type Page } from "@playwright/test";
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

function event(id: string, start: string, end: string): SeededEvent {
  return {
    kind: "timed",
    id,
    summary: id,
    colorId: null,
    start,
    end,
    timeZone: "America/Los_Angeles",
  };
}

async function createSeededExtension(events: SeededEvent[]) {
  const extensionPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "plan-geometry-extension-"),
  );
  await fs.cp(path.resolve("dist"), extensionPath, { recursive: true });
  await fs.writeFile(
    path.join(extensionPath, "background/service-worker.js"),
    `
import registerServiceWorker from "./register-service-worker.js";

registerServiceWorker({
  openAppPage: () => chrome.tabs.create({ url: chrome.runtime.getURL("index.html") }),
  requestCachedToken: async () => ({ ok: true, value: "test-token" }),
  requestInteractiveToken: async () => ({ ok: true, value: "test-token" }),
  listPrimaryCalendarEvents: async () => ({
    ok: true,
    value: { timeZone: "America/Los_Angeles", events: ${JSON.stringify(events)} },
  }),
}, () => new Date("2026-07-15T19:00:00.000Z"));
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

async function expectGeometry(
  page: Page,
  eventId: string,
  geometry: { top: string; height: string },
) {
  await expect(page.locator(`[data-calendar-event-id="${eventId}"]`)).toHaveCSS(
    "top",
    geometry.top,
  );
  await expect(page.locator(`[data-calendar-event-id="${eventId}"]`)).toHaveCSS(
    "height",
    geometry.height,
  );
}

test("renders the default range and exact block geometry", async () => {
  const extensionPath = await createSeededExtension([
    event(
      "normal",
      "2026-07-15T09:00:00-07:00",
      "2026-07-15T10:00:00-07:00",
    ),
    event(
      "short",
      "2026-07-15T10:00:00-07:00",
      "2026-07-15T10:05:00-07:00",
    ),
    event(
      "boundary-short",
      "2026-07-15T20:55:00-07:00",
      "2026-07-15T21:00:00-07:00",
    ),
  ]);
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(page.getByTestId("plan-grid-body")).toHaveAttribute(
      "data-start-hour",
      "7",
    );
    await expect(page.getByTestId("plan-grid-body")).toHaveAttribute(
      "data-end-hour",
      "21",
    );
    await expectGeometry(page, "normal", { top: "168px", height: "84px" });
    await expectGeometry(page, "short", { top: "252px", height: "20px" });
    await expectGeometry(page, "boundary-short", {
      top: "1169px",
      height: "20px",
    });
    await expect(page.getByTestId("plan-grid-body")).toHaveCSS(
      "height",
      "1189px",
    );
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("expands early and late boundaries with whole-hour rounding", async () => {
  const extensionPath = await createSeededExtension([
    event(
      "early",
      "2026-07-15T06:30:00-07:00",
      "2026-07-15T07:00:00-07:00",
    ),
    event(
      "late",
      "2026-07-15T21:15:00-07:00",
      "2026-07-15T21:30:00-07:00",
    ),
  ]);
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(page.getByTestId("plan-grid-body")).toHaveAttribute(
      "data-start-hour",
      "6",
    );
    await expect(page.getByTestId("plan-grid-body")).toHaveAttribute(
      "data-end-hour",
      "22",
    );
    await expectGeometry(page, "early", { top: "42px", height: "42px" });
    await expectGeometry(page, "late", { top: "1281px", height: "21px" });
    await expect(page.getByTestId("plan-hour-line")).toHaveCount(0);
    await expect(page.getByTestId("plan-hour-marker-22")).toHaveCSS(
      "top",
      "1344px",
    );
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("clips midnight crossings and discards malformed events", async () => {
  const extensionPath = await createSeededExtension([
    event(
      "from-yesterday",
      "2026-07-14T23:30:00-07:00",
      "2026-07-15T00:30:00-07:00",
    ),
    event(
      "into-tomorrow",
      "2026-07-15T23:30:00-07:00",
      "2026-07-16T00:30:00-07:00",
    ),
    event("malformed", "not-a-date", "also-not-a-date"),
    event(
      "zero",
      "2026-07-15T12:00:00-07:00",
      "2026-07-15T12:00:00-07:00",
    ),
  ]);
  const { context, page } = await openExtension(extensionPath);

  try {
    await expect(page.getByTestId("plan-grid-body")).toHaveAttribute(
      "data-start-hour",
      "0",
    );
    await expect(page.getByTestId("plan-grid-body")).toHaveAttribute(
      "data-end-hour",
      "24",
    );
    await expectGeometry(page, "from-yesterday", {
      top: "0px",
      height: "42px",
    });
    await expectGeometry(page, "into-tomorrow", {
      top: "1974px",
      height: "42px",
    });
    await expect(
      page.locator('[data-calendar-event-id="from-yesterday"]'),
    ).toContainText("30m");
    await expect(page.locator('[data-calendar-event-id="malformed"]')).toHaveCount(
      0,
    );
    await expect(page.locator('[data-calendar-event-id="zero"]')).toHaveCount(0);
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});

test("shows time ranges only on blocks at least 40px tall", async () => {
  const extensionPath = await createSeededExtension([
    event(
      "compact",
      "2026-07-15T09:00:00-07:00",
      "2026-07-15T09:20:00-07:00",
    ),
    event(
      "tall",
      "2026-07-15T10:00:00-07:00",
      "2026-07-15T10:30:00-07:00",
    ),
  ]);
  const { context, page } = await openExtension(extensionPath);

  try {
    const compact = page.locator('[data-calendar-event-id="compact"]');
    const tall = page.locator('[data-calendar-event-id="tall"]');
    await expect(compact).toContainText("20m");
    await expect(compact.getByTestId("plan-event-time-range")).toHaveCount(0);
    await expect(tall).toContainText("30m");
    await expect(tall.getByTestId("plan-event-time-range")).toHaveText(
      "10:00 AM – 10:30 AM",
    );
  } finally {
    await context.close();
    await fs.rm(extensionPath, { recursive: true, force: true });
  }
});
