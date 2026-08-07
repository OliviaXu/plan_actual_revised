import { useEffect, useRef, useState } from "react";

import type { EditableEvent } from "../../domain/day-event";
import type { AppSettings } from "../../config/settings";

type EventResizePreview = {
  eventId: string;
  durationMinutes: number;
};

type ResizeSettings = Pick<
  AppSettings,
  "minimumBlockDurationMinutes" | "pixelsPerMinute" | "snapMinutes"
>;

export function useEventResize({
  events,
  disabled,
  onResizeEnd,
  settings,
}: {
  events: EditableEvent[];
  disabled?: boolean;
  onResizeEnd?: (eventId: string, durationMinutes: number) => void;
  settings: ResizeSettings;
}) {
  const [preview, setPreview] = useState<EventResizePreview>();
  const previewRef = useRef<EventResizePreview | undefined>(undefined);
  const removePointerListenersRef = useRef<(() => void) | undefined>(
    undefined,
  );

  useEffect(() => {
    return () => removePointerListenersRef.current?.();
  }, []);

  function startResize(
    event: EditableEvent,
    initialPointer: PointerEvent,
  ) {
    if (disabled) return;

    function stopListening() {
      removePointerListenersRef.current?.();
      removePointerListenersRef.current = undefined;
    }

    stopListening();
    const initialPreview = {
      eventId: event.id,
      durationMinutes: event.durationMinutes,
    };
    previewRef.current = initialPreview;
    setPreview(initialPreview);

    function updatePreview(pointer: PointerEvent) {
      const durationMinutes = calculateResizeDuration(
        event.durationMinutes,
        pointer.clientY - initialPointer.clientY,
        settings,
      );
      if (previewRef.current?.durationMinutes === durationMinutes) return;

      const nextPreview = { eventId: event.id, durationMinutes };
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
        finalPreview.durationMinutes !== event.durationMinutes
      ) {
        onResizeEnd?.(event.id, finalPreview.durationMinutes);
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

  const eventsWithResizePreview = events.map((event) =>
    event.id === preview?.eventId
      ? { ...event, durationMinutes: preview.durationMinutes }
      : event,
  );

  return { eventsWithResizePreview, startResize };
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
