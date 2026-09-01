import { isRecord } from "../shared/is-record";

export type ReflectionOutcome =
  | "done"
  | "madeProgress"
  | "didntGetTo"
  | "notSet";

export type ReflectionSession = {
  schemaVersion: 1;
  date: string;
  focusSummary: string | null;
  weeklyPracticeSummary: string | null;
  outcome?: ReflectionOutcome;
  detail: string;
  weeklyPracticeReflection: string;
  nextExperiment: string;
  nextFrog: string;
  snoozedUntil: string | null;
};

const reflectionOutcomes: ReflectionOutcome[] = [
  "done",
  "madeProgress",
  "didntGetTo",
  "notSet",
];

export function normalizeReflectionSession(
  value: unknown,
): ReflectionSession | null {
  if (!isRecord(value)) return null;
  const valid =
    value.schemaVersion === 1 &&
    isLocalDate(value.date) &&
    isNullableString(value.focusSummary) &&
    isNullableString(value.weeklyPracticeSummary) &&
    (value.outcome === undefined ||
      reflectionOutcomes.includes(value.outcome as ReflectionOutcome)) &&
    typeof value.detail === "string" &&
    typeof value.weeklyPracticeReflection === "string" &&
    typeof value.nextExperiment === "string" &&
    typeof value.nextFrog === "string" &&
    (value.snoozedUntil === null ||
      (typeof value.snoozedUntil === "string" &&
        Number.isFinite(Date.parse(value.snoozedUntil))));
  return valid ? value as ReflectionSession : null;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}
