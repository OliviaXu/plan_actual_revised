export type DayEvent = {
  id: string;
  summary: string;
  startMinutes: number;
  durationMinutes: number;
  colorId: string;
};

export type PlanEvent = DayEvent;

export type EditableEvent = DayEvent & {
  sourceCalendarEventId?: string;
  isSlack?: true;
};

export type SaveDisposition = "unsaved" | "calendarSaved" | "planMatched";

export type SaveError = {
  code: string;
  message: string;
};

export type ActualEvent = EditableEvent & {
  saveDisposition?: SaveDisposition;
  calendarEventId?: string;
  lastSaveAttemptAt?: string;
  lastSaveError?: SaveError;
};

export type RevisedEvent = EditableEvent;

export type EditableColumn = "actual" | "revised";
