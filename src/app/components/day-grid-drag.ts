export type DayGridDragSourceColumn = "plan" | "actual" | "revised";
export type DayGridDropTargetColumn = "actual" | "revised";

export type DayGridDropOperation = {
  sourceColumn: DayGridDragSourceColumn;
  sourceEventId: string;
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
    (pointerClientY -
      columnViewportTopPx -
      grabOffsetYPx) /
      pixelsPerMinute;
  const snappedStartMinutes =
    Math.round(unsnappedStartMinutes / snapMinutes) * snapMinutes;

  return Math.min(
    gridEndMinutes - snapMinutes,
    Math.max(gridStartMinutes, snappedStartMinutes),
  );
}
