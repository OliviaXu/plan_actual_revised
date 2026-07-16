export const GOOGLE_CALENDAR_EVENT_COLORS = {
  "1": "#7986cb",
  "2": "#33b679",
  "3": "#8e24aa",
  "4": "#e67c73",
  "5": "#f6c026",
  "6": "#f5511d",
  "7": "#039be5",
  "8": "#616161",
  "9": "#3f51b5",
  "10": "#0b8043",
  "11": "#d60000",
} as const;

export function resolveGoogleCalendarEventColor(colorId: string | null) {
  if (colorId === null || !Object.hasOwn(GOOGLE_CALENDAR_EVENT_COLORS, colorId)) {
    return null;
  }

  return GOOGLE_CALENDAR_EVENT_COLORS[
    colorId as keyof typeof GOOGLE_CALENDAR_EVENT_COLORS
  ];
}
