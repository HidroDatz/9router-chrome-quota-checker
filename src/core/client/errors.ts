export type RouterClientErrorCode =
  | "OFFLINE"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "INCOMPATIBLE_VERSION"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

export type RouterRequestStage =
  | "health"
  | "version"
  | "auth-status"
  | "provider-connections"
  | "usage"
  | "unknown";

export interface RouterClientErrorDetails {
  stage?: RouterRequestStage;
  method?: string;
  url?: string;
  elapsedMs?: number;
  timedOut?: boolean;
  causeName?: string;
  causeMessage?: string;
  browserUserAgent?: string;
  navigatorOnline?: boolean;
  hostPermissionGranted?: boolean;
  declaredHostPermissions?: string[];
}

export interface RouterClientErrorOptions extends ErrorOptions {
  details?: RouterClientErrorDetails | null;
}

export class RouterClientError extends Error {
  readonly code: RouterClientErrorCode;
  readonly status: number | null;
  readonly details: RouterClientErrorDetails | null;

  constructor(
    code: RouterClientErrorCode,
    message: string,
    status: number | null = null,
    options?: RouterClientErrorOptions,
  ) {
    super(message, options);
    this.name = "RouterClientError";
    this.code = code;
    this.status = status;
    this.details = options?.details ?? null;
  }
}

export function asRouterClientError(error: unknown): RouterClientError {
  if (error instanceof RouterClientError) return error;
  const cause = error instanceof Error ? error : new Error(String(error));
  return new RouterClientError("HTTP_ERROR", cause.message || "Unknown 9Router error", null, {
    cause,
    details: {
      stage: "unknown",
      causeName: cause.name,
      causeMessage: cause.message,
    },
  });
}
