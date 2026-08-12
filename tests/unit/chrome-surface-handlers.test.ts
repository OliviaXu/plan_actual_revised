import { describe, expect, it, vi } from "vitest";

import { createChromeSurfaceHandlers } from "../../src/background/chrome-surface-handlers";

describe("createChromeSurfaceHandlers", () => {
  it("creates the standalone app when no app tab exists", async () => {
    const createAppTab = vi.fn(async () => undefined);
    const operations = createChromeSurfaceHandlers({
      activateAppTab: vi.fn(async () => undefined),
      createAppTab,
      disableSidePanel: vi.fn(async () => undefined),
      focusWindow: vi.fn(async () => undefined),
      openSidePanel: vi.fn(async () => undefined),
      findAppTabs: vi.fn(async () => []),
      setSidePanelOptions: vi.fn(async () => undefined),
    });

    await operations.openAppPage();

    expect(createAppTab).toHaveBeenCalledOnce();
  });

  it("activates the existing standalone app tab and focuses its window", async () => {
    const activateAppTab = vi.fn(async () => undefined);
    const createAppTab = vi.fn(async () => undefined);
    const focusWindow = vi.fn(async () => undefined);
    const operations = createChromeSurfaceHandlers({
      activateAppTab,
      createAppTab,
      disableSidePanel: vi.fn(async () => undefined),
      focusWindow,
      openSidePanel: vi.fn(async () => undefined),
      findAppTabs: vi.fn(async () => [{ id: 12, windowId: 34 }]),
      setSidePanelOptions: vi.fn(async () => undefined),
    });

    await operations.openAppPage();

    expect(activateAppTab).toHaveBeenCalledWith(12);
    expect(focusWindow).toHaveBeenCalledWith(34);
    expect(createAppTab).not.toHaveBeenCalled();
  });

  it("gives every Calendar action a fresh panel path before opening it", async () => {
    const calls: string[] = [];
    const setSidePanelOptions = vi.fn(async (options: unknown) => {
      calls.push(`set:${JSON.stringify(options)}`);
    });
    const openSidePanel = vi.fn(async (options: unknown) => {
      calls.push(`open:${JSON.stringify(options)}`);
    });
    const refreshKeys = ["first", "second"];
    const operations = createChromeSurfaceHandlers({
      activateAppTab: vi.fn(async () => undefined),
      createAppTab: vi.fn(async () => undefined),
      disableSidePanel: vi.fn(async () => undefined),
      focusWindow: vi.fn(async () => undefined),
      openSidePanel,
      findAppTabs: vi.fn(async () => []),
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
    const operations = createChromeSurfaceHandlers({
      activateAppTab: vi.fn(async () => undefined),
      createAppTab: vi.fn(async () => undefined),
      disableSidePanel,
      focusWindow: vi.fn(async () => undefined),
      openSidePanel: vi.fn(async () => undefined),
      findAppTabs: vi.fn(async () => []),
      setSidePanelOptions: vi.fn(async () => undefined),
    });

    await operations.disableSidePanel(9);

    expect(disableSidePanel).toHaveBeenCalledWith({ tabId: 9, enabled: false });
  });
});
