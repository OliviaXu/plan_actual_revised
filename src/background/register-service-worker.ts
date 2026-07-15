import type { Result } from "../shared/result";
import type {
  CalendarEvent,
  CalendarEventRange,
} from "../calendar/calendar-event";
import type { CalendarLoadStats } from "../calendar/google-calendar-client";

type ServiceWorkerDependencies = {
  openAppPage: () => Promise<unknown>;
  requestCachedToken: () => Promise<Result<string>>;
  requestInteractiveToken: () => Promise<Result<string>>;
  listPrimaryCalendarEvents: (
    token: string,
    range: CalendarEventRange,
  ) => Promise<Result<{ events: CalendarEvent[]; stats?: CalendarLoadStats }>>;
};

type CalendarResult = Result<{ events: CalendarEvent[] }>;

export default function registerServiceWorker(
  dependencies: ServiceWorkerDependencies,
  now: () => Date = () => new Date(),
) {
  const inFlightReads = new Map<string, Promise<CalendarResult>>();
  chrome.action.onClicked.addListener(() => {
    void dependencies.openAppPage();
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "auth.requestInteractiveToken") {
      void dependencies.requestInteractiveToken().then((result) => {
        sendResponse(
          result.ok
            ? { ok: true, value: { status: "connected" } }
            : result,
        );
      });
      return true;
    }

    if (message?.type === "calendar.listEvents") {
      const range = getLocalDayRange(now());
      const requestKey = `${range.timeMin}:${range.timeMax}`;
      let load = inFlightReads.get(requestKey);
      if (!load) {
        load = loadCalendarEvents(dependencies, range);
        inFlightReads.set(requestKey, load);
        void load.finally(() => inFlightReads.delete(requestKey));
      }
      void load.then(sendResponse);
      return true;
    }

    return false;
  });
}

async function loadCalendarEvents(
  dependencies: ServiceWorkerDependencies,
  range: CalendarEventRange,
): Promise<CalendarResult> {
  const startedAt = performance.now();
  const authResult = await dependencies.requestCachedToken();
  const cachedAuthDurationMs = performance.now() - startedAt;
  if (!authResult.ok) {
    const result = {
      ok: false as const,
      error: {
        code: "AUTH_NOT_CONNECTED",
        message: "Connect Calendar before requesting events.",
      },
    };
    console.info("calendar-plan-load", {
      ok: false,
      cachedAuthDurationMs,
      backgroundTotalDurationMs: performance.now() - startedAt,
    });
    return result;
  }

  const result = await dependencies.listPrimaryCalendarEvents(authResult.value, range);
  if (!result.ok) {
    console.info("calendar-plan-load", {
      ok: false,
      cachedAuthDurationMs,
      backgroundTotalDurationMs: performance.now() - startedAt,
    });
    return result;
  }

  console.info("calendar-plan-load", {
    ok: true,
    renderedTimedEventCount: result.value.events.filter(
      (event) => event.kind === "timed",
    ).length,
    ...result.value.stats,
    cachedAuthDurationMs,
    backgroundTotalDurationMs: performance.now() - startedAt,
  });
  return { ok: true, value: { events: result.value.events } };
}

function getLocalDayRange(now: Date): CalendarEventRange {
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const timeMax = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() };
}
