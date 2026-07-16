import type { Result } from "../shared/result";
import type {
  CalendarEvent,
  CalendarEventRange,
} from "./calendar-event";

const CALENDAR_LIST_FAILED_CODE = "CALENDAR_LIST_FAILED";

export type CalendarLoadStats = {
  pageCount: number;
  rawEventCount: number;
  calendarHttpAndJsonDurationMs: number;
  normalizationDurationMs: number;
};

export async function listPrimaryCalendarEvents(
  token: string,
  range: CalendarEventRange,
  fetchCalendar: typeof fetch = fetch,
): Promise<Result<{ events: CalendarEvent[]; stats: CalendarLoadStats }>> {
  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", range.timeMin);
  url.searchParams.set("timeMax", range.timeMax);

  try {
    const startedAt = performance.now();
    const items: unknown[] = [];
    let pageCount = 0;
    let pageToken: string | undefined;

    do {
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await fetchCalendar(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const parsedBody: unknown = await response.json().catch(() => null);
      const body = isRecord(parsedBody) ? parsedBody : null;

      if (!response.ok) {
        const error = body && isRecord(body.error) ? body.error : null;
        return {
          ok: false,
          error: {
            code: CALENDAR_LIST_FAILED_CODE,
            message:
              error && typeof error.message === "string"
                ? error.message
                : "Unable to list Calendar events.",
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

      pageCount += 1;
      items.push(...(Array.isArray(body.items) ? body.items : []));
      pageToken =
        typeof body.nextPageToken === "string"
          ? body.nextPageToken
          : undefined;
    } while (pageToken);

    const calendarHttpAndJsonDurationMs = performance.now() - startedAt;
    const normalizationStartedAt = performance.now();
    const events = items.flatMap(normalizeCalendarEvent);

    return {
      ok: true,
      value: {
        events,
        stats: {
          pageCount,
          rawEventCount: items.length,
          calendarHttpAndJsonDurationMs,
          normalizationDurationMs: performance.now() - normalizationStartedAt,
        },
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
  const privateProperties =
    isRecord(value.extendedProperties) &&
    isRecord(value.extendedProperties.private)
      ? value.extendedProperties.private
      : null;
  const appKind =
    privateProperties?.planActualRevised === "true" &&
    privateProperties.kind === "actual"
      ? ("actual" as const)
      : undefined;

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
        ...(appKind ? { appKind } : {}),
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
        ...(appKind ? { appKind } : {}),
      },
    ];
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
