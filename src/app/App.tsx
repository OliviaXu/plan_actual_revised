import { CalendarDays } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "./components/ui/button";
import { defaultSettings } from "../domain/settings";

type BackgroundStatus = "checking" | "online" | "offline";
type CalendarStatus =
  | "checking"
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

type RuntimeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string } };

export function App() {
  const [backgroundStatus, setBackgroundStatus] =
    useState<BackgroundStatus>("checking");
  const [calendarStatus, setCalendarStatus] =
    useState<CalendarStatus>("checking");
  const [calendarEventCount, setCalendarEventCount] = useState<number | null>(
    null,
  );
  const [calendarError, setCalendarError] = useState<string | null>(null);

  useEffect(() => {
    chrome.runtime
      .sendMessage({ type: "app.health" })
      .then((response) => {
        setBackgroundStatus(response?.ok ? "online" : "offline");
      })
      .catch(() => {
        setBackgroundStatus("offline");
      });

    chrome.runtime
      .sendMessage({ type: "auth.getStatus" })
      .then(
        (
          response: RuntimeResult<{
            status: "connected" | "disconnected";
          }>,
        ) => {
          setCalendarStatus(response.ok ? response.value.status : "error");
          setCalendarError(response.ok ? null : response.error.message);
        },
      )
      .catch(() => {
        setCalendarStatus("error");
        setCalendarError("Unable to reach the background auth boundary.");
      });
  }, []);

  async function connectCalendar() {
    setCalendarStatus("connecting");
    setCalendarEventCount(null);
    setCalendarError(null);

    try {
      const authResponse = (await chrome.runtime.sendMessage({
        type: "auth.requestInteractiveToken",
      })) as RuntimeResult<{ status: "connected" }>;

      if (!authResponse.ok) {
        setCalendarStatus("error");
        setCalendarError(authResponse.error.message);
        return;
      }

      const calendarResponse = (await chrome.runtime.sendMessage({
        type: "calendar.listEvents",
      })) as RuntimeResult<{ eventCount: number }>;

      if (!calendarResponse.ok) {
        setCalendarStatus("error");
        setCalendarError(calendarResponse.error.message);
        return;
      }

      setCalendarStatus("connected");
      setCalendarEventCount(calendarResponse.value.eventCount);
    } catch {
      setCalendarStatus("error");
      setCalendarError("Unable to reach the background Calendar boundary.");
    }
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

        <div className="grid gap-4 md:grid-cols-3">
          <StatusCard
            label="Background"
            value={
              backgroundStatus === "online"
                ? "Background online"
                : backgroundStatus === "checking"
                  ? "Checking background"
                  : "Background offline"
            }
            testId="background-status"
          />
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
                {calendarStatus === "connected"
                  ? "Calendar connected"
                  : calendarStatus === "connecting"
                    ? "Connecting Calendar"
                    : calendarStatus === "checking"
                      ? "Checking Calendar"
                      : calendarStatus === "error"
                        ? "Calendar error"
                        : "Calendar disconnected"}
              </p>
            </div>
            <Button
              type="button"
              onClick={() => void connectCalendar()}
              disabled={calendarStatus === "connecting"}
            >
              {calendarStatus === "connecting"
                ? "Connecting"
                : "Connect Calendar"}
            </Button>
          </div>

          {calendarEventCount !== null ? (
            <p className="mt-4 text-sm text-muted-foreground" data-testid="calendar-result">
              Calendar returned {calendarEventCount} events
            </p>
          ) : null}

          {calendarError ? (
            <p className="mt-4 text-sm font-medium text-destructive" data-testid="calendar-error">
              {calendarError}
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
