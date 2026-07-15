import type { Result } from "../shared/result";

const CALENDAR_LIST_FAILED_CODE = "CALENDAR_LIST_FAILED";

type GoogleCalendarListResponse = {
  items?: unknown[];
  error?: { message?: string };
};

export async function listPrimaryCalendarEvents(
  token: string,
  fetchCalendar: typeof fetch = fetch,
): Promise<Result<{ eventCount: number }>> {
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
      value: { eventCount: body.items?.length ?? 0 },
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
