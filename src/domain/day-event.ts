export type DayEvent = {
  id: string;
  summary: string;
  startMinutes: number;
  durationMinutes: number;
  colorId: string;
};

export type PlanEvent = DayEvent;

export type SaveDisposition = "unsaved" | "calendarSaved" | "planMatched";

export type SaveError = {
  code: string;
  message: string;
};

export type ActualEvent = DayEvent & {
  saveDisposition?: SaveDisposition;
  calendarEventId?: string;
  lastSaveAttemptAt?: string;
  lastSaveError?: SaveError;
};
