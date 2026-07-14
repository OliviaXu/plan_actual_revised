export type AppError = {
  code: string;
  message: string;
  recoverable: boolean;
  cause?: unknown;
  httpStatus?: number;
};

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppError };

export function unexpectedError(
  code: string,
  fallbackMessage: string,
  cause: unknown,
): Result<never> {
  return {
    ok: false,
    error: {
      code,
      message: cause instanceof Error ? cause.message : fallbackMessage,
      recoverable: true,
      cause,
    },
  };
}
