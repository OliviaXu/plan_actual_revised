import type { ActualBlock } from "../domain/day-record";
import type { Result } from "../shared/result";

export type CalendarActualInput = {
  block: ActualBlock;
  date: string;
  timezone: string;
  summaryPrefix: string;
  defaultColorId: string;
};

export function calendarEventIdForActual(blockId: string) {
  return `par${blockId.toLowerCase().replace(/-/g, "")}`;
}

export async function insertPrimaryCalendarActual(
  token: string,
  input: CalendarActualInput,
  fetchCalendar: typeof fetch = fetch,
): Promise<Result<{ eventId: string }>> {
  const eventId = calendarEventIdForActual(input.block.id);
  const metadata = {
    planActualRevised: "true",
    kind: "actual",
    sourceBlockId: input.block.id,
  };
  try {
    const response = await fetchCalendar(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: eventId,
          summary: `${input.summaryPrefix} ${input.block.summary}`.trim(),
          start: {
            dateTime: localDateTime(input.date, input.block.startMinutes),
            timeZone: input.timezone,
          },
          end: {
            dateTime: localDateTime(
              input.date,
              input.block.startMinutes + input.block.durationMinutes,
            ),
            timeZone: input.timezone,
          },
          colorId: input.block.colorId || input.defaultColorId,
          attendees: [],
          reminders: { useDefault: false },
          extendedProperties: { private: metadata },
        }),
      },
    );

    if (response.status === 409) {
      return verifyExistingActual(
        token,
        eventId,
        input.block.id,
        fetchCalendar,
      );
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(body) || body.id !== eventId) {
      return failure(
        isRecord(body) && isRecord(body.error) &&
          typeof body.error.message === "string"
          ? body.error.message
          : "Unable to prove the Actual event was created.",
      );
    }
    return { ok: true, value: { eventId } };
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Unable to save Actual.");
  }
}

async function verifyExistingActual(
  token: string,
  eventId: string,
  blockId: string,
  fetchCalendar: typeof fetch,
): Promise<Result<{ eventId: string }>> {
  try {
    const response = await fetchCalendar(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body: unknown = await response.json().catch(() => null);
    const privateProperties =
      isRecord(body) && isRecord(body.extendedProperties) &&
      isRecord(body.extendedProperties.private)
        ? body.extendedProperties.private
        : null;
    if (
      response.ok &&
      isRecord(body) &&
      body.id === eventId &&
      privateProperties?.planActualRevised === "true" &&
      privateProperties.sourceBlockId === blockId
    ) {
      return { ok: true, value: { eventId } };
    }
    return {
      ok: false,
      error: {
        code: "CALENDAR_ACTUAL_ID_COLLISION",
        message: "The deterministic Calendar event ID belongs to another event.",
      },
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Unable to verify Actual.");
  }
}

function localDateTime(date: string, totalMinutes: number) {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCMinutes(totalMinutes);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}T${String(base.getUTCHours()).padStart(2, "0")}:${String(base.getUTCMinutes()).padStart(2, "0")}:00`;
}

function failure(message: string): Result<never> {
  return {
    ok: false,
    error: { code: "CALENDAR_ACTUAL_INSERT_FAILED", message },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
