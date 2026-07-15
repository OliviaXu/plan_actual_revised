import type { Result } from "../shared/result";
import type {
  CalendarEvent,
  CalendarEventRange,
} from "./calendar-event";

const CALENDAR_LIST_FAILED_CODE = "CALENDAR_LIST_FAILED";

type GoogleCalendarListResponse = {
  items?: unknown[];
  error?: { message?: string };
};

export async function listPrimaryCalendarEvents(
  token: string,
  range: CalendarEventRange,
  fetchCalendar: typeof fetch = fetch,
): Promise<Result<{ events: CalendarEvent[] }>> {
  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", range.timeMin);
  url.searchParams.set("timeMax", range.timeMax);

  try {
    const response = await fetchCalendar(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const parsedBody: unknown = await response.json().catch(() => null);
    const body =
      typeof parsedBody === "object" &&
      parsedBody !== null &&
      !Array.isArray(parsedBody)
        ? (parsedBody as GoogleCalendarListResponse)
        : null;

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: CALENDAR_LIST_FAILED_CODE,
          message: body?.error?.message ?? "Unable to list Calendar events.",
        },
      };
    }

    if (!body) {
      return {
        ok: false,
        error: {
          code: CALENDAR_LIST_FAILED_CODE,
          message: "Unable to read the Calendar response.",
        },
      };
    }

    return {
      ok: true,
      value: {
        events: (body.items ?? []).flatMap(normalizeCalendarEvent),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: CALENDAR_LIST_FAILED_CODE,
        message:
          error instanceof Error
            ? error.message
            : "Unable to list Calendar events.",
      },
    };
  }
}

function normalizeCalendarEvent(value: unknown): CalendarEvent[] {
  if (!isRecord(value) || typeof value.id !== "string") {
    return [];
  }

  const summary = typeof value.summary === "string" ? value.summary : null;
  const colorId = typeof value.colorId === "string" ? value.colorId : null;
  const start = isRecord(value.start) ? value.start : null;
  const end = isRecord(value.end) ? value.end : null;

  if (
    start &&
    end &&
    typeof start.dateTime === "string" &&
    typeof end.dateTime === "string"
  ) {
    return [
      {
        kind: "timed",
        id: value.id,
        summary,
        colorId,
        start: start.dateTime,
        end: end.dateTime,
        timeZone: typeof start.timeZone === "string" ? start.timeZone : null,
      },
    ];
  }

  if (
    start &&
    end &&
    typeof start.date === "string" &&
    typeof end.date === "string"
  ) {
    return [
      {
        kind: "allDay",
        id: value.id,
        summary,
        colorId,
        startDate: start.date,
        endDate: end.date,
      },
    ];
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
