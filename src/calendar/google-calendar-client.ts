import type { Result } from "../shared/result";
import { unexpectedError } from "../shared/result";

export type CalendarListSummary = {
  eventCount: number;
};

type GoogleCalendarListResponse = {
  items?: unknown[];
  error?: {
    message?: string;
  };
};

type ListPrimaryCalendarEventsOptions = {
  token: string;
  fetchCalendar?: typeof fetch;
};

export async function listPrimaryCalendarEvents({
  token,
  fetchCalendar = fetch,
}: ListPrimaryCalendarEventsOptions): Promise<Result<CalendarListSummary>> {
  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", now.toISOString());
  url.searchParams.set("timeMax", tomorrow.toISOString());

  try {
    const response = await fetchCalendar(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as GoogleCalendarListResponse;

    if (!response.ok) {
      return {
        ok: false,
        error: {
          code: "CALENDAR_LIST_FAILED",
          message: body.error?.message ?? "Unable to list Calendar events.",
          recoverable: true,
          httpStatus: response.status,
        },
      };
    }

    return {
      ok: true,
      value: { eventCount: body.items?.length ?? 0 },
    };
  } catch (error) {
    return unexpectedError(
      "CALENDAR_LIST_FAILED",
      "Unable to list Calendar events.",
      error,
    );
  }
}
