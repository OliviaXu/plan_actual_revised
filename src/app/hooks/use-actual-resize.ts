import { useEffect, useRef, useState } from "react";

import type { ActualEvent } from "../../domain/day-event";
import type { AppSettings } from "../../domain/settings";

type ActualResizePreview = {
  actualId: string;
  durationMinutes: number;
};

type ResizeSettings = Pick<
  AppSettings,
  "minimumBlockDurationMinutes" | "pixelsPerMinute" | "snapMinutes"
>;

export function useActualResize({
  actuals,
  disabled,
  onResizeEnd,
  settings,
}: {
  actuals: ActualEvent[];
  disabled?: boolean;
  onResizeEnd?: (actualId: string, durationMinutes: number) => void;
  settings: ResizeSettings;
}) {
  const [preview, setPreview] = useState<ActualResizePreview>();
  const previewRef = useRef<ActualResizePreview | undefined>(undefined);
  const removePointerListenersRef = useRef<(() => void) | undefined>(
    undefined,
  );

  useEffect(() => {
    return () => removePointerListenersRef.current?.();
  }, []);

  function startActualResize(
    actual: ActualEvent,
    initialPointer: PointerEvent,
  ) {
    if (disabled) return;

    function stopListening() {
      removePointerListenersRef.current?.();
      removePointerListenersRef.current = undefined;
    }

    stopListening();
    const initialPreview = {
      actualId: actual.id,
      durationMinutes: actual.durationMinutes,
    };
    previewRef.current = initialPreview;
    setPreview(initialPreview);

    function updatePreview(event: PointerEvent) {
      const durationMinutes = calculateResizeDuration(
        actual.durationMinutes,
        event.clientY - initialPointer.clientY,
        settings,
      );
      if (previewRef.current?.durationMinutes === durationMinutes) return;

      const nextPreview = { actualId: actual.id, durationMinutes };
      previewRef.current = nextPreview;
      setPreview(nextPreview);
    }

    function clearResizeSession() {
      stopListening();
      previewRef.current = undefined;
      setPreview(undefined);
    }

    function finishResize() {
      const finalPreview = previewRef.current;
      clearResizeSession();
      if (
        finalPreview &&
        finalPreview.durationMinutes !== actual.durationMinutes
      ) {
        onResizeEnd?.(actual.id, finalPreview.durationMinutes);
      }
    }

    removePointerListenersRef.current = listenForPointerSession(
      initialPointer.pointerId,
      {
        onMove: updatePreview,
        onEnd: finishResize,
        onCancel: clearResizeSession,
      },
    );
  }

  const displayedActuals = actuals.map((actual) =>
    actual.id === preview?.actualId
      ? { ...actual, durationMinutes: preview.durationMinutes }
      : actual,
  );

  return { displayedActuals, startActualResize };
}

function calculateResizeDuration(
  initialDurationMinutes: number,
  verticalDistancePx: number,
  settings: ResizeSettings,
) {
  const unsnappedDuration =
    initialDurationMinutes + verticalDistancePx / settings.pixelsPerMinute;
  const snappedDuration =
    Math.round(unsnappedDuration / settings.snapMinutes) *
    settings.snapMinutes;
  return Math.max(settings.minimumBlockDurationMinutes, snappedDuration);
}

function listenForPointerSession(
  pointerId: number,
  {
    onMove,
    onEnd,
    onCancel,
  }: {
    onMove: (event: PointerEvent) => void;
    onEnd: () => void;
    onCancel: () => void;
  },
) {
  const handleMove = (event: PointerEvent) => {
    if (event.pointerId === pointerId) onMove(event);
  };
  const handleEnd = (event: PointerEvent) => {
    if (event.pointerId === pointerId) onEnd();
  };
  const handleCancel = (event: PointerEvent) => {
    if (event.pointerId === pointerId) onCancel();
  };

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleEnd);
  window.addEventListener("pointercancel", handleCancel);

  return () => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleEnd);
    window.removeEventListener("pointercancel", handleCancel);
  };
}
