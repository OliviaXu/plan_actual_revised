import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export const calendarSurfaceTransitionDurationMs = 240;

type CalendarSurfaceTransitionProps = {
  children: ReactNode;
  surfaceKey: string;
};

type CalendarSurface = {
  children: ReactNode;
  key: string;
};

export function CalendarSurfaceTransition({
  children,
  surfaceKey,
}: CalendarSurfaceTransitionProps) {
  const previousSurfaceRef = useRef<CalendarSurface>({
    children,
    key: surfaceKey,
  });
  const removalTimeoutRef = useRef<number | undefined>(undefined);
  const [outgoingSurface, setOutgoingSurface] =
    useState<CalendarSurface>();

  useLayoutEffect(() => {
    const previousSurface = previousSurfaceRef.current;
    if (previousSurface.key !== surfaceKey) {
      window.clearTimeout(removalTimeoutRef.current);
      setOutgoingSurface(previousSurface);
      removalTimeoutRef.current = window.setTimeout(
        () => setOutgoingSurface(undefined),
        calendarSurfaceTransitionDurationMs,
      );
    }
    previousSurfaceRef.current = { children, key: surfaceKey };
  }, [children, surfaceKey]);

  useEffect(
    () => () => window.clearTimeout(removalTimeoutRef.current),
    [],
  );

  return (
    <div className="grid min-w-0">
      {outgoingSurface ? (
        <div
          aria-hidden="true"
          className="calendar-surface-exit pointer-events-none col-start-1 row-start-1 min-w-0"
          data-testid="calendar-surface-outgoing"
          inert
          key={`outgoing-${outgoingSurface.key}`}
        >
          {outgoingSurface.children}
        </div>
      ) : null}
      <div
        className={
          outgoingSurface
            ? "calendar-surface-enter col-start-1 row-start-1 min-w-0"
            : "col-start-1 row-start-1 min-w-0"
        }
        key={surfaceKey}
      >
        {children}
      </div>
    </div>
  );
}
