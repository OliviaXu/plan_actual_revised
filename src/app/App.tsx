import { CalendarDays, CircleAlert } from "lucide-react";

import { CalendarSurfaceTransition } from "./components/CalendarSurfaceTransition";
import { Button } from "./components/ui/button";
import { Toast } from "./components/ui/toast";
import { DayIntentions } from "./components/DayIntentions";
import { DayPlanner } from "./components/DayPlanner";
import { useCalendarPlan } from "./hooks/use-calendar-plan";
import type { AppSurface } from "./hooks/use-responsive-day-grid-layout-mode";
import { useDayPlannerToast } from "./hooks/use-day-planner-toast";

const readSystemTime = () => new Date();
const reloadAppPage = () => window.location.reload();

export type AppProps = {
  now?: () => Date;
  launchSlack: () => void;
  reloadPage?: () => void;
  appSurface?: AppSurface;
};

export function App({
  now = readSystemTime,
  launchSlack,
  reloadPage = reloadAppPage,
  appSurface = "standalone",
}: AppProps) {
  const sidePanel = appSurface === "side-panel";
  const {
    calendarState,
    calendarDay,
    connectCalendar,
  } = useCalendarPlan(now);
  const toast = useDayPlannerToast();
  const currentDate = now();
  const isCalendarCheckingIn =
    calendarState.status === "loading" ||
    calendarState.status === "connecting";
  const calendarTransitionKey = isCalendarCheckingIn
    ? "check-in"
    : calendarState.status;

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      data-app-surface={appSurface}
    >
      <section className={sidePanel
        ? "flex w-full flex-col gap-3 px-2 py-3"
        : "mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8"}
      >
        <header
          className="flex items-center gap-2 text-muted-foreground"
          data-testid="app-date-header"
        >
          <CalendarDays
            aria-hidden="true"
            className="h-5 w-5 shrink-0"
            data-testid="app-date-calendar-icon"
          />
          <h1 className={sidePanel ? "text-sm" : "text-base font-medium"}>
            {currentDate.toLocaleDateString(undefined, {
              timeZone: calendarDay.timeZone,
              weekday: "short",
              month: "long",
              day: "numeric",
            })}
          </h1>
        </header>

        <CalendarSurfaceTransition transitionKey={calendarTransitionKey}>
          {isCalendarCheckingIn ? (
            <section
              aria-live="polite"
              className="grid w-fit grid-cols-[auto_1fr] items-start gap-x-2 py-1"
              data-testid="calendar-check-in"
              role="status"
            >
              <span aria-hidden="true" className="text-base leading-6">
                👋
              </span>
              <div className="min-w-0">
                <p className="calendar-check-in-greeting relative w-fit text-base font-medium leading-6">
                  Let’s shape today.
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Checking in with your calendar…
                </p>
              </div>
            </section>
          ) : calendarState.status === "disconnected" ? (
            <section className="py-1" aria-label="Calendar connection">
              {calendarState.errorMessage ? (
                <p
                  className="mb-3 text-sm font-medium text-destructive"
                  data-testid="calendar-error"
                  role="alert"
                >
                  {calendarState.errorMessage}
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Connect Google Calendar to show today&apos;s plan
              </p>
              <Button
                className="mt-3"
                type="button"
                onClick={() => void connectCalendar()}
              >
                Connect Calendar
              </Button>
            </section>
          ) : calendarState.status === "error" ? (
            <section
              className="grid w-fit grid-cols-[auto_1fr] items-start gap-x-2 py-1"
              role="alert"
            >
              <CircleAlert
                aria-hidden="true"
                className="mt-1 h-4 w-4 text-destructive"
                data-testid="calendar-error-icon"
              />
              <div className="min-w-0">
                <h2 className="text-base font-medium leading-6">
                  Unable to load today&apos;s plan
                </h2>
                <p
                  className="mt-0.5 text-sm text-muted-foreground"
                  data-testid="calendar-error"
                >
                  {calendarState.message}
                </p>
                <Button
                  className="mt-3"
                  onClick={reloadPage}
                  type="button"
                >
                  Refresh page
                </Button>
              </div>
            </section>
          ) : (
            <div className="flex min-w-0 flex-col gap-6">
              <DayIntentions
                appSurface={appSurface}
                calendarDay={calendarDay}
                dailyFocusSummary={calendarState.dailyFocusSummary}
                dailyReflectionExists={calendarState.dailyReflectionExists}
                now={now}
                onFeedback={toast.show}
                weeklyPracticeState={calendarState.weeklyPracticeState}
              />
              <DayPlanner
                appSurface={appSurface}
                calendarDay={calendarDay}
                launchSlack={launchSlack}
                now={now}
                onFeedback={toast.show}
                planEvents={calendarState.planEvents}
              />
            </div>
          )}
        </CalendarSurfaceTransition>
      </section>
      {toast.current ? (
        <Toast
          action={toast.current.action}
          durationMs={toast.current.durationMs}
          key={toast.current.id}
          message={toast.current.message}
          onDismiss={toast.clear}
          onDurationEnd={toast.clear}
          testId={`${toast.current.source}-toast`}
          tone={toast.current.tone}
        />
      ) : null}
    </main>
  );
}
