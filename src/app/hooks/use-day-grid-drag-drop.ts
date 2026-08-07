import {
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

export type DayGridDragSourceColumn = "plan" | "actual" | "revised";
export type DayGridDropTargetColumn = "actual" | "revised";

export type DayGridDropOperation = {
  sourceColumn: DayGridDragSourceColumn;
  sourceEventId: string;
  targetColumn: DayGridDropTargetColumn;
  startMinutes: number;
};

type DayGridDragSettings = {
  pixelsPerMinute: number;
  snapMinutes: number;
};

type DragSession = {
  sourceColumn: DayGridDragSourceColumn;
  sourceEventId: string;
  grabOffsetYPx: number;
};

type DropPreview = {
  targetColumn: DayGridDropTargetColumn;
  startMinutes: number;
};

export function calculateDroppedStartMinutes({
  pointerClientY,
  columnViewportTopPx,
  grabOffsetYPx,
  gridStartMinutes,
  gridEndMinutes,
  pixelsPerMinute,
  snapMinutes,
}: {
  pointerClientY: number;
  columnViewportTopPx: number;
  grabOffsetYPx: number;
  gridStartMinutes: number;
  gridEndMinutes: number;
  pixelsPerMinute: number;
  snapMinutes: number;
}) {
  const unsnappedStartMinutes =
    gridStartMinutes +
    (pointerClientY - columnViewportTopPx - grabOffsetYPx) /
      pixelsPerMinute;
  const snappedStartMinutes =
    Math.round(unsnappedStartMinutes / snapMinutes) * snapMinutes;

  return Math.min(
    gridEndMinutes - snapMinutes,
    Math.max(gridStartMinutes, snappedStartMinutes),
  );
}

export type DayGridDragDropController = {
  dropPreview?: DropPreview;
  captureGrabOffset: (
    event: ReactMouseEvent<HTMLButtonElement>,
    sourceColumn: DayGridDragSourceColumn,
    sourceEventId: string,
  ) => void;
  startDrag: (
    event: ReactDragEvent<HTMLButtonElement>,
    sourceColumn: DayGridDragSourceColumn,
    sourceEventId: string,
  ) => void;
  previewDrop: (
    event: ReactDragEvent<HTMLDivElement>,
    targetColumn: DayGridDropTargetColumn,
  ) => void;
  clearDropPreview: (
    event: ReactDragEvent<HTMLDivElement>,
  ) => void;
  finishDrop: (
    event: ReactDragEvent<HTMLDivElement>,
    targetColumn: DayGridDropTargetColumn,
  ) => void;
  clearDragState: () => void;
};

export function useDayGridDragDrop({
  gridStartMinutes,
  gridEndMinutes,
  disabled,
  onDrop,
  settings,
}: {
  gridStartMinutes: number;
  gridEndMinutes: number;
  disabled?: boolean;
  onDrop?: (operation: DayGridDropOperation) => void;
  settings: DayGridDragSettings;
}): DayGridDragDropController {
  const [dragSession, setDragSession] = useState<DragSession>();
  const [dropPreview, setDropPreview] = useState<DropPreview>();
  const pendingGrabRef = useRef<DragSession | undefined>(undefined);

  function getDroppedStartMinutes(
    event: ReactDragEvent<HTMLDivElement>,
    grabOffsetYPx: number,
  ) {
    return calculateDroppedStartMinutes({
      pointerClientY: event.clientY,
      columnViewportTopPx: event.currentTarget.getBoundingClientRect().top,
      grabOffsetYPx,
      gridStartMinutes,
      gridEndMinutes,
      pixelsPerMinute: settings.pixelsPerMinute,
      snapMinutes: settings.snapMinutes,
    });
  }

  function captureGrabOffset(
    event: ReactMouseEvent<HTMLButtonElement>,
    sourceColumn: DayGridDragSourceColumn,
    sourceEventId: string,
  ) {
    const blockViewportTopPx =
      event.currentTarget.getBoundingClientRect().top;
    pendingGrabRef.current = {
      sourceColumn,
      sourceEventId,
      grabOffsetYPx: event.clientY - blockViewportTopPx,
    };
  }

  function startDrag(
    event: ReactDragEvent<HTMLButtonElement>,
    sourceColumn: DayGridDragSourceColumn,
    sourceEventId: string,
  ) {
    event.dataTransfer.effectAllowed =
      sourceColumn === "plan" ? "copy" : "move";
    event.dataTransfer.setData("text/plain", sourceEventId);
    const blockRect = event.currentTarget.getBoundingClientRect();
    const recordedGrab = pendingGrabRef.current;
    setDragSession({
      sourceColumn,
      sourceEventId,
      grabOffsetYPx:
        recordedGrab?.sourceColumn === sourceColumn &&
        recordedGrab.sourceEventId === sourceEventId
          ? recordedGrab.grabOffsetYPx
          : blockRect.height / 2,
    });
  }

  function previewDrop(
    event: ReactDragEvent<HTMLDivElement>,
    targetColumn: DayGridDropTargetColumn,
  ) {
    if (disabled || !dragSession) return;

    event.preventDefault();
    event.dataTransfer.dropEffect =
      dragSession.sourceColumn === "plan" ? "copy" : "move";
    setDropPreview({
      targetColumn,
      startMinutes: getDroppedStartMinutes(
        event,
        dragSession.grabOffsetYPx,
      ),
    });
  }

  function clearDropPreview(
    event: ReactDragEvent<HTMLDivElement>,
  ) {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    setDropPreview(undefined);
  }

  function finishDrop(
    event: ReactDragEvent<HTMLDivElement>,
    targetColumn: DayGridDropTargetColumn,
  ) {
    if (disabled || !dragSession) {
      clearDragState();
      return;
    }

    event.preventDefault();
    onDrop?.({
      sourceColumn: dragSession.sourceColumn,
      sourceEventId: dragSession.sourceEventId,
      targetColumn,
      startMinutes: getDroppedStartMinutes(
        event,
        dragSession.grabOffsetYPx,
      ),
    });
    clearDragState();
  }

  function clearDragState() {
    pendingGrabRef.current = undefined;
    setDragSession(undefined);
    setDropPreview(undefined);
  }

  return {
    dropPreview,
    captureGrabOffset,
    startDrag,
    previewDrop,
    clearDropPreview,
    finishDrop,
    clearDragState,
  };
}
