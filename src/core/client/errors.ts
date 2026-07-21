export type RouterClientErrorCode =
  | "OFFLINE"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "INCOMPATIBLE_VERSION"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

export class RouterClientError extends Error {
  readonly code: RouterClientErrorCode;
  readonly status: number | null;

  constructor(
    code: RouterClientErrorCode,
    message: string,
    status: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RouterClientError";
    this.code = code;
    this.status = status;
  }
}

export function asRouterClientError(error: unknown): RouterClientError {
  if (error instanceof RouterClientError) return error;
  const message = error instanceof Error ? error.message : "Unknown 9Router error";
  return new RouterClientError("HTTP_ERROR", message, null, {
    cause: error instanceof Error ? error : undefined,
  });
}
