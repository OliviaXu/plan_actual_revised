export type CalendarEvent = TimedCalendarEvent | AllDayCalendarEvent;

export type TimedCalendarEvent = {
  kind: "timed";
  id: string;
  summary: string | null;
  colorId: string | null;
  start: string;
  end: string;
  timeZone: string | null;
};

export type AllDayCalendarEvent = {
  kind: "allDay";
  id: string;
  summary: string | null;
  colorId: string | null;
  startDate: string;
  endDate: string;
};

export type CalendarEventRange = {
  timeMin: string;
  timeMax: string;
};
