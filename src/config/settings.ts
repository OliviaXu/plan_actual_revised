export type AppSettings = {
  dayStartHour: number;
  dayEndHour: number;
  pixelsPerMinute: number;
  snapMinutes: number;
  minimumBlockDurationMinutes: number;
  hiddenPlanColorIds: string[];
  dailyFocusColorId: string;
  weeklyLearningColorId: string;
  defaultActualColorId: string;
  slackColorId: string;
  slackDefaultDurationMinutes: number;
  reflectionTimeMinutes: number;
  actualPaletteColorIds: string[];
  actualEventPrefix: string;
  slackEventPrefix: string;
};

export const defaultSettings: AppSettings = {
  dayStartHour: 7,
  dayEndHour: 21,
  pixelsPerMinute: 1.4,
  snapMinutes: 5,
  minimumBlockDurationMinutes: 5,
  hiddenPlanColorIds: ["2", "10"],
  dailyFocusColorId: "5",
  weeklyLearningColorId: "4",
  defaultActualColorId: "8",
  slackColorId: "1",
  slackDefaultDurationMinutes: 15,
  reflectionTimeMinutes: 16 * 60 + 30,
  actualPaletteColorIds: ["11", "6", "1"],
  actualEventPrefix: "[Actual]",
  slackEventPrefix: "[s]",
};
