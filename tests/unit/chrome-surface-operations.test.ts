import { describe, expect, it, vi } from "vitest";

import { createChromeSurfaceOperations } from "../../src/background/chrome-surface-operations";

describe("createChromeSurfaceOperations", () => {
  it("gives every Calendar action a fresh panel path before opening it", async () => {
    const calls: string[] = [];
    const setSidePanelOptions = vi.fn(async (options: unknown) => {
      calls.push(`set:${JSON.stringify(options)}`);
    });
    const openSidePanel = vi.fn(async (options: unknown) => {
      calls.push(`open:${JSON.stringify(options)}`);
    });
    const refreshKeys = ["first", "second"];
    const operations = createChromeSurfaceOperations({
      disableSidePanel: vi.fn(async () => undefined),
      openAppPage: vi.fn(async () => undefined),
      openSidePanel,
      setSidePanelOptions,
    }, () => refreshKeys.shift()!);

    await operations.openCalendarSidePanel(17);
    await operations.openCalendarSidePanel(17);

    expect(calls).toEqual([
      'set:{"tabId":17,"path":"side-panel.html?refresh=first","enabled":true}',
      'open:{"tabId":17}',
      'set:{"tabId":17,"path":"side-panel.html?refresh=second","enabled":true}',
      'open:{"tabId":17}',
    ]);
  });

  it("disables only the requested tab", async () => {
    const disableSidePanel = vi.fn(async () => undefined);
    const operations = createChromeSurfaceOperations({
      disableSidePanel,
      openAppPage: vi.fn(async () => undefined),
      openSidePanel: vi.fn(async () => undefined),
      setSidePanelOptions: vi.fn(async () => undefined),
    });

    await operations.disableSidePanel(9);

    expect(disableSidePanel).toHaveBeenCalledWith({ tabId: 9, enabled: false });
  });
});
