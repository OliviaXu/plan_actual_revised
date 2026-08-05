import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import { useState } from "react";

import { formatMinuteOfDay } from "../../calendar/calendar-time";
import type {
  EditableColumn,
  EditableEvent,
} from "../../domain/day-event";
import { defaultSettings } from "../../domain/settings";
import { useEditableEventResize } from "../hooks/use-editable-event-resize";
import { EditableGridBlock } from "./DayGridEventBlock";
import { calculateDayGridBlocks } from "./day-grid-layout";

const DAY_GRID_DROP_TARGET_CLASS_NAME = "bg-accent/15";

type EditableDayGridColumnProps = {
  column: EditableColumn;
  gridStartHour: number;
  gridEndHour: number;
  events: EditableEvent[];
  dropPreviewStartMinutes?: number;
  mutationsDisabled?: boolean;
  onSelectEvent: (event: EditableEvent) => void;
  onResizeEnd: (eventId: string, durationMinutes: number) => void;
  onGrabOffsetCapture: (
    event: ReactMouseEvent<HTMLButtonElement>,
    eventId: string,
  ) => void;
  onDragStart: (
    event: ReactDragEvent<HTMLButtonElement>,
    eventId: string,
  ) => void;
  onDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  onDragEnd: (event: ReactDragEvent<HTMLButtonElement>) => void;
};

export function EditableDayGridColumn({
  column,
  gridStartHour,
  gridEndHour,
  events,
  dropPreviewStartMinutes,
  mutationsDisabled,
  onSelectEvent,
  onResizeEnd,
  onGrabOffsetCapture,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: EditableDayGridColumnProps) {
  const [frontEventId, setFrontEventId] = useState<string | null>(null);
  const { displayedEvents, startResize } = useEditableEventResize({
    events,
    disabled: mutationsDisabled,
    onResizeEnd,
    settings: defaultSettings,
  });
  const blocks = calculateDayGridBlocks(
    displayedEvents,
    gridStartHour,
    gridEndHour,
    defaultSettings,
  );
  const gridStartMinutes = gridStartHour * 60;

  return (
    <div
      className={`${column === "actual" ? "day-grid-column-enter " : ""}relative overflow-hidden border-l border-border ${
        dropPreviewStartMinutes === undefined
          ? ""
          : DAY_GRID_DROP_TARGET_CLASS_NAME
      }`}
      data-testid={`${column}-column`}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dropPreviewStartMinutes !== undefined ? (
        <DropTimeIndicator
          gridStartMinutes={gridStartMinutes}
          startMinutes={dropPreviewStartMinutes}
        />
      ) : null}
      {blocks.map((block) => (
        <EditableGridBlock
          key={block.event.id}
          column={column}
          block={block}
          frontZIndex={blocks.length}
          isFront={frontEventId === block.event.id}
          disabled={mutationsDisabled}
          onSelect={() => {
            setFrontEventId(block.event.id);
            onSelectEvent(block.event);
          }}
          onResizeStart={(event, pointer) => {
            setFrontEventId(event.id);
            startResize(event, pointer);
          }}
          onGrabOffsetCapture={(event) =>
            onGrabOffsetCapture(event, block.event.id)
          }
          onDragStart={(event) => onDragStart(event, block.event.id)}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}

function DropTimeIndicator({
  gridStartMinutes,
  startMinutes,
}: {
  gridStartMinutes: number;
  startMinutes: number;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex items-start"
      data-testid="drop-time-indicator"
      style={{
        top:
          (startMinutes - gridStartMinutes) *
          defaultSettings.pixelsPerMinute,
      }}
    >
      <span
        className={`shrink-0 px-1 text-[10px] font-medium text-now/80 ${
          startMinutes === gridStartMinutes ? "" : "-translate-y-full"
        }`}
      >
        {formatMinuteOfDay(startMinutes)}
      </span>
      <span
        aria-hidden="true"
        className="min-w-0 flex-1 border-t border-now/40"
        data-testid="drop-time-trace"
      />
    </div>
  );
}
