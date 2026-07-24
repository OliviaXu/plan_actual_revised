import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import type { Result } from "../shared/result";
import {
  runCatchUp,
  type CatchUpDependencies,
} from "./run-catch-up";

type CatchUpRunner = (
  today: string,
  dependencies: CatchUpDependencies,
) => Promise<CatchUpRunResult>;

export function createCatchUpRequestHandler(
  dependencies: CatchUpDependencies,
  catchUpRunner: CatchUpRunner = runCatchUp,
) {
  let inFlightCatchUp: Promise<Result<CatchUpRunResult>> | undefined;

  return (todayDate: string) => {
    if (!inFlightCatchUp) {
      const startedAt = performance.now();
      const catchUp = catchUpRunner(todayDate, dependencies)
        .then((summary) => {
          console.info("calendar-catch-up", {
            ok: true,
            ...summary,
            totalDurationMs: performance.now() - startedAt,
          });
          return { ok: true as const, value: summary };
        })
        .catch(() => {
          console.info("calendar-catch-up", {
            ok: false,
            totalDurationMs: performance.now() - startedAt,
          });
          return {
            ok: false as const,
            error: {
              code: "CATCH_UP_FAILED",
              message: "Unable to catch up historical Actuals.",
            },
          };
        });
      inFlightCatchUp = catchUp;
      void catchUp.finally(() => {
        if (inFlightCatchUp === catchUp) {
          inFlightCatchUp = undefined;
        }
      });
    }
    return inFlightCatchUp;
  };
}
