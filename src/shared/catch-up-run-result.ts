export type CatchUpRunResult = {
  affectedDayCount: number;
  saved: number;
  matched: number;
  failed: number;
  discarded: number;
  invalidRecordCount: number;
  storageErrorCount: number;
};
