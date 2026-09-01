export type CalendarEvent = TimedCalendarEvent | AllDayCalendarEvent;

export type TimedCalendarEvent = {
  kind: "timed";
  id: string;
  summary: string | null;
  colorId: string | null;
  start: string;
  end: string;
  timeZone: string | null;
  isExtensionActual?: boolean;
};

export type AllDayCalendarEvent = {
  kind: "allDay";
  id: string;
  summary: string | null;
  description?: string | null;
  colorId: string | null;
  startDate: string;
  endDate: string;
  isReflection?: boolean;
};

export type CalendarEventRange = {
  timeMin: string;
  timeMax: string;
};

export type CalendarInsertEvent = {
  id?: string;
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string } | { date: string };
  end: { dateTime: string; timeZone: string } | { date: string };
  colorId?: string;
  reminders?: { useDefault: boolean };
  visibility?: "default" | "public" | "private" | "confidential";
  transparency?: "opaque" | "transparent";
  extendedProperties?: { private: Record<string, string> };
};
