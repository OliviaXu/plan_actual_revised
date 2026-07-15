import { CalendarDays } from "lucide-react";
import { useState } from "react";

import { Button } from "./components/ui/button";
import { defaultSettings } from "../domain/settings";
import type { Result } from "../shared/result";

type CalendarState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; eventCount: number | null }
  | { status: "error"; message: string };

export function App() {
  const [calendar, setCalendar] = useState<CalendarState>({
    status: "disconnected",
  });

  async function connectCalendar() {
    setCalendar({ status: "connecting" });

    try {
      const authResponse = (await chrome.runtime.sendMessage({
        type: "auth.requestInteractiveToken",
      })) as Result<{ status: "connected" }>;

      if (!authResponse.ok) {
        setCalendar({ status: "error", message: authResponse.error.message });
        return;
      }

      const calendarResponse = (await chrome.runtime.sendMessage({
        type: "calendar.listEvents",
      })) as Result<{ eventCount: number }>;

      if (!calendarResponse.ok) {
        setCalendar({
          status: "error",
          message: calendarResponse.error.message,
        });
        return;
      }

      setCalendar({
        status: "connected",
        eventCount: calendarResponse.value.eventCount,
      });
    } catch {
      setCalendar({
        status: "error",
        message: "Unable to reach the background Calendar boundary.",
      });
    }
  }

  let calendarStatusText: string;
  switch (calendar.status) {
    case "disconnected":
      calendarStatusText = "Calendar disconnected";
      break;
    case "connecting":
      calendarStatusText = "Connecting Calendar";
      break;
    case "connected":
      calendarStatusText = "Calendar connected";
      break;
    case "error":
      calendarStatusText = "Calendar error";
      break;
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <header className="flex items-center justify-between border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground shadow-soft">
              <CalendarDays aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Chrome extension</p>
              <h1 className="text-2xl font-semibold tracking-normal">
                Plan / Actual / Revised
              </h1>
            </div>
          </div>
          <Button type="button">Phase 1</Button>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <StatusCard
            label="Default day range"
            value={`${defaultSettings.dayStartHour}:00-${defaultSettings.dayEndHour}:00`}
            testId="day-range"
          />
          <StatusCard
            label="Hidden plan colors"
            value={defaultSettings.hiddenPlanColorIds.join(", ")}
            testId="hidden-colors"
          />
        </div>

        <section className="rounded-md border border-border bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Calendar boundary
              </p>
              <p className="mt-2 text-base font-semibold" data-testid="calendar-status">
                {calendarStatusText}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void connectCalendar()}
              disabled={calendar.status === "connecting"}
            >
              {calendar.status === "connecting"
                ? "Connecting"
                : "Connect Calendar"}
            </Button>
          </div>

          {calendar.status === "connected" && calendar.eventCount !== null ? (
            <p className="mt-4 text-sm text-muted-foreground" data-testid="calendar-result">
              Calendar returned {calendar.eventCount} events
            </p>
          ) : null}

          {calendar.status === "error" ? (
            <p className="mt-4 text-sm font-medium text-destructive" data-testid="calendar-error">
              {calendar.message}
            </p>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function StatusCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId: string;
}) {
  return (
    <article className="rounded-md border border-border bg-white p-4 shadow-soft">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold" data-testid={testId}>
        {value}
      </p>
    </article>
  );
}
