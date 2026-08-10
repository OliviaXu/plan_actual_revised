import type { Page } from "@playwright/test";
import { afterEach, expect, it } from "vitest";

import {
  getRealChromeCdpUrl,
  requireConnectedCalendar,
} from "../real/real-browser";

const originalCdpUrl = process.env.REAL_CHROME_CDP_URL;

afterEach(() => {
  if (originalCdpUrl === undefined) delete process.env.REAL_CHROME_CDP_URL;
  else process.env.REAL_CHROME_CDP_URL = originalCdpUrl;
});

it("connects to the dedicated real Chrome debugging port by default", () => {
  delete process.env.REAL_CHROME_CDP_URL;

  expect(getRealChromeCdpUrl()).toBe("http://127.0.0.1:9225");
});

it("allows an explicit real Chrome CDP endpoint", () => {
  process.env.REAL_CHROME_CDP_URL = "http://127.0.0.1:9333";

  expect(getRealChromeCdpUrl()).toBe("http://127.0.0.1:9333");
});

function calendarPage({ connected }: { connected: boolean }) {
  return {
    getByRole: (_role: string, options: { name: string }) => ({
      isVisible: async () =>
        options.name === "Log Slack time" ? connected : !connected,
    }),
  } as unknown as Page;
}

it("allows a real smoke to proceed once Calendar is connected", async () => {
  await expect(
    requireConnectedCalendar(calendarPage({ connected: true })),
  ).resolves.toBeUndefined();
});

it("fails clearly once Calendar settles as disconnected", async () => {
  await expect(
    requireConnectedCalendar(calendarPage({ connected: false })),
  ).rejects.toThrow("Complete Connect Calendar");
});
