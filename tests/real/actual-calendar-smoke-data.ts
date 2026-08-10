import { randomUUID } from "node:crypto";

export function createActualCalendarSmokeIds() {
  const blockId = randomUUID();
  return {
    blockId,
    eventId: `par${blockId.replaceAll("-", "")}`,
  };
}
