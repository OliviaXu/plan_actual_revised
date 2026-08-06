import { useEffect, useState } from "react";

export type DayGridLayoutMode = "actual" | "actual-revised" | "full";
export type AppSurface = "standalone" | "side-panel";

export function getSidePanelLayoutMode(width: number): DayGridLayoutMode {
  if (width < 520) return "actual";
  if (width < 1024) return "actual-revised";
  return "full";
}

export function useResponsiveDayGridLayoutMode(
  appSurface: AppSurface,
): DayGridLayoutMode {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const isSidePanel = appSurface === "side-panel";

  useEffect(() => {
    if (!isSidePanel) return;

    const updateLayoutMode = () =>
      setViewportWidth(window.innerWidth);
    window.addEventListener("resize", updateLayoutMode);
    return () => window.removeEventListener("resize", updateLayoutMode);
  }, [isSidePanel]);

  return isSidePanel ? getSidePanelLayoutMode(viewportWidth) : "full";
}
