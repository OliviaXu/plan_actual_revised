type SidePanelOptions = {
  tabId: number;
  path?: string;
  enabled?: boolean;
};

type ChromeSurfaceDependencies = {
  findAppTabs: () => Promise<Array<{ id: number; windowId: number }>>;
  createAppTab: () => Promise<unknown>;
  activateAppTab: (tabId: number) => Promise<unknown>;
  focusWindow: (windowId: number) => Promise<unknown>;
  setSidePanelOptions: (options: SidePanelOptions) => Promise<void>;
  openSidePanel: (options: { tabId: number }) => Promise<void>;
  disableSidePanel: (options: SidePanelOptions) => Promise<void>;
};

export function createChromeSurfaceHandlers(
  dependencies: ChromeSurfaceDependencies,
  createRefreshKey: () => string = () => `${Date.now()}`,
) {
  return {
    async openAppPage() {
      const [appTab] = await dependencies.findAppTabs();
      if (!appTab) {
        await dependencies.createAppTab();
        return;
      }

      await Promise.all([
        dependencies.activateAppTab(appTab.id),
        dependencies.focusWindow(appTab.windowId),
      ]);
    },
    async openCalendarSidePanel(tabId: number) {
      const refreshKey = encodeURIComponent(createRefreshKey());
      const configurePanel = dependencies.setSidePanelOptions({
        tabId,
        path: `side-panel.html?refresh=${refreshKey}`,
        enabled: true,
      });
      const openPanel = dependencies.openSidePanel({ tabId });
      await Promise.all([configurePanel, openPanel]);
    },
    disableSidePanel: (tabId: number) =>
      dependencies.disableSidePanel({ tabId, enabled: false }),
  };
}
