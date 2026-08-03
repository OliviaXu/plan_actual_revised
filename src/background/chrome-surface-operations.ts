type SidePanelOptions = {
  tabId: number;
  path?: string;
  enabled?: boolean;
};

type ChromeSurfaceDependencies = {
  openAppPage: () => Promise<unknown>;
  setSidePanelOptions: (options: SidePanelOptions) => Promise<void>;
  openSidePanel: (options: { tabId: number }) => Promise<void>;
  disableSidePanel: (options: SidePanelOptions) => Promise<void>;
};

export function createChromeSurfaceOperations(
  dependencies: ChromeSurfaceDependencies,
  createRefreshKey: () => string = () => `${Date.now()}`,
) {
  return {
    openAppPage: dependencies.openAppPage,
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
