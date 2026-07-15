import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./components/ui/button";
import { PlanDayGrid } from "./components/PlanDayGrid";
import type { CalendarEvent } from "../calendar/calendar-event";
import type { Result } from "../shared/result";

type CalendarState =
  | { status: "loading" }
  | { status: "disconnected"; errorMessage?: string }
  | { status: "connecting" }
  | { status: "connected"; events: CalendarEvent[] }
  | { status: "error"; message: string };

const readSystemTime = () => new Date();

export function App({ now = readSystemTime }: { now?: () => Date }) {
  const [calendar, setCalendar] = useState<CalendarState>({ status: "loading" });

  useEffect(() => {
    void loadCalendarEvents(setCalendar);
  }, []);

  async function connectCalendar() {
    setCalendar({ status: "connecting" });

    try {
      const authResponse = (await chrome.runtime.sendMessage({
        type: "auth.requestInteractiveToken",
      })) as Result<{ status: "connected" }>;

      if (!authResponse.ok) {
        setCalendar({
          status: "disconnected",
          errorMessage: authResponse.error.message,
        });
        return;
      }

      await loadCalendarEvents(setCalendar);
    } catch {
      setCalendar({
        status: "disconnected",
        errorMessage: "Unable to reach the background Calendar boundary.",
      });
    }
  }

  const events = calendar.status === "connected" ? calendar.events : [];
  const errorMessage =
    calendar.status === "error"
      ? calendar.message
      : calendar.status === "disconnected"
        ? calendar.errorMessage
        : undefined;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-soft">
              <CalendarDays aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {now().toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <h1 className="text-2xl font-semibold tracking-normal">
                Plan / Actual / Revised
              </h1>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <p
            className="rounded-md border border-destructive bg-white px-4 py-3 text-sm font-medium text-destructive"
            data-testid="calendar-error"
          >
            {errorMessage}
          </p>
        ) : null}

        {calendar.status === "disconnected" ? (
          <section
            className="max-w-md rounded-md border border-border bg-white p-5 shadow-soft"
            aria-label="Calendar connection"
          >
            <p className="font-semibold">
              Connect Google Calendar to show today&apos;s plan
            </p>
            <Button
              className="mt-4"
              type="button"
              onClick={() => void connectCalendar()}
            >
              Connect Calendar
            </Button>
          </section>
        ) : (
          <PlanDayGrid events={events} status={calendar.status} />
        )}
      </section>
    </main>
  );
}

async function loadCalendarEvents(setCalendar: (state: CalendarState) => void) {
  setCalendar({ status: "loading" });

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "calendar.listEvents",
    })) as Result<{ events: CalendarEvent[] }>;

    if (response.ok) {
      setCalendar({ status: "connected", events: response.value.events });
      return;
    }

    if (response.error.code === "AUTH_NOT_CONNECTED") {
      setCalendar({ status: "disconnected" });
      return;
    }

    setCalendar({ status: "error", message: response.error.message });
  } catch {
    setCalendar({
      status: "error",
      message: "Unable to reach the background Calendar boundary.",
    });
  }
}
