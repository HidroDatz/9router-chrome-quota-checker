import {
  RouterClientError,
  type RouterClientErrorDetails,
  type RouterRequestStage,
} from "./errors";
import type {
  ProviderConnection,
  ProviderConnectionsResponse,
  RawUsageResponse,
  RouterAuthStatusResponse,
  RouterHealthResponse,
  RouterVersionResponse,
} from "../quota/types";
import { normalizeBaseUrl, routerUrl } from "../../shared/url";

export const MIN_SUPPORTED_9ROUTER_VERSION = "0.5.40";
const DEFAULT_TIMEOUT_MS = 15_000;
const CONNECTION_PAGE_SIZE = 100;

type FetchLike = typeof fetch;

interface NineRouterClientOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

interface RequestJsonOptions {
  absolute?: boolean;
  stage: RouterRequestStage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSemver(version: string): [number, number, number] | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function browserDetails(): Pick<
  RouterClientErrorDetails,
  "browserUserAgent" | "navigatorOnline"
> {
  if (typeof navigator === "undefined") return {};
  return {
    browserUserAgent: navigator.userAgent,
    navigatorOnline: navigator.onLine,
  };
}

export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return 0;
  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

export class NineRouterClient {
  readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, options: NineRouterClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  getLoginUrl(): string {
    return routerUrl(this.baseUrl, "login");
  }

  async getHealth(): Promise<RouterHealthResponse> {
    const path = "api/health";
    const data = await this.requestJson<unknown>(path, {}, { stage: "health" });
    if (!isRecord(data) || data.ok !== true) {
      throw new RouterClientError(
        "INVALID_RESPONSE",
        "9Router health endpoint returned an unexpected response.",
        200,
        { details: this.endpointDetails("health", path) },
      );
    }
    return { ok: true };
  }

  async getVersion(): Promise<RouterVersionResponse> {
    const path = "api/version";
    const data = await this.requestJson<unknown>(path, {}, { stage: "version" });
    if (!isRecord(data) || typeof data.currentVersion !== "string") {
      throw new RouterClientError(
        "INVALID_RESPONSE",
        "9Router version endpoint returned an unexpected response.",
        200,
        { details: this.endpointDetails("version", path) },
      );
    }
    return {
      currentVersion: data.currentVersion,
      latestVersion:
        typeof data.latestVersion === "string" || data.latestVersion === null
          ? data.latestVersion
          : undefined,
      hasUpdate: typeof data.hasUpdate === "boolean" ? data.hasUpdate : undefined,
    };
  }

  async assertCompatibleVersion(): Promise<RouterVersionResponse> {
    const version = await this.getVersion();
    if (compareSemver(version.currentVersion, MIN_SUPPORTED_9ROUTER_VERSION) < 0) {
      throw new RouterClientError(
        "INCOMPATIBLE_VERSION",
        `9Router ${version.currentVersion} is not supported. Upgrade to ${MIN_SUPPORTED_9ROUTER_VERSION} or newer.`,
        null,
        { details: this.endpointDetails("version", "api/version") },
      );
    }
    return version;
  }

  async getAuthStatus(): Promise<RouterAuthStatusResponse> {
    const path = "api/auth/status";
    const data = await this.requestJson<unknown>(path, {}, { stage: "auth-status" });
    if (!isRecord(data) || typeof data.requireLogin !== "boolean") {
      throw new RouterClientError(
        "INVALID_RESPONSE",
        "9Router auth status endpoint returned an unexpected response.",
        200,
        { details: this.endpointDetails("auth-status", path) },
      );
    }
    return {
      requireLogin: data.requireLogin,
      authMode: typeof data.authMode === "string" ? data.authMode : undefined,
      oidcConfigured:
        typeof data.oidcConfigured === "boolean" ? data.oidcConfigured : undefined,
      displayName: typeof data.displayName === "string" ? data.displayName : undefined,
      loginMethod: typeof data.loginMethod === "string" ? data.loginMethod : undefined,
    };
  }

  async getProviderConnections(activeOnly = true): Promise<ProviderConnection[]> {
    const allConnections: ProviderConnection[] = [];
    let page = 1;
    let totalPages = 1;

    do {
      const url = new URL(routerUrl(this.baseUrl, "api/providers/client"));
      url.searchParams.set("accountStatus", activeOnly ? "active" : "all");
      url.searchParams.set("sort", "priority");
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(CONNECTION_PAGE_SIZE));
      const data = await this.requestJson<unknown>(url.toString(), {}, {
        absolute: true,
        stage: "provider-connections",
      });
      const parsed = this.parseConnectionsResponse(data, url.toString());
      allConnections.push(...parsed.connections);
      totalPages = Math.max(1, parsed.pagination?.totalPages ?? 1);
      page += 1;
    } while (page <= totalPages);

    return allConnections;
  }

  async getUsage(connectionId: string): Promise<RawUsageResponse> {
    if (!connectionId.trim()) {
      throw new RouterClientError("INVALID_RESPONSE", "Connection ID is required.", null, {
        details: { stage: "usage" },
      });
    }
    const path = `api/usage/${encodeURIComponent(connectionId)}`;
    const data = await this.requestJson<unknown>(path, {}, { stage: "usage" });
    if (!isRecord(data)) {
      throw new RouterClientError(
        "INVALID_RESPONSE",
        "9Router usage endpoint returned an unexpected response.",
        200,
        { details: this.endpointDetails("usage", path) },
      );
    }
    return data;
  }

  private parseConnectionsResponse(
    data: unknown,
    requestUrl: string,
  ): ProviderConnectionsResponse {
    if (!isRecord(data) || !Array.isArray(data.connections)) {
      throw new RouterClientError(
        "INVALID_RESPONSE",
        "9Router provider endpoint returned an unexpected response.",
        200,
        {
          details: {
            stage: "provider-connections",
            method: "GET",
            url: requestUrl,
            ...browserDetails(),
          },
        },
      );
    }
    const connections = data.connections.filter((entry): entry is ProviderConnection =>
      isRecord(entry) && typeof entry.id === "string" && typeof entry.provider === "string",
    );
    const pagination = isRecord(data.pagination)
      ? {
          page: Number(data.pagination.page) || 1,
          pageSize: Number(data.pagination.pageSize) || CONNECTION_PAGE_SIZE,
          total: Number(data.pagination.total) || connections.length,
          totalPages: Number(data.pagination.totalPages) || 1,
        }
      : undefined;
    return {
      connections,
      providerOptions: Array.isArray(data.providerOptions)
        ? data.providerOptions.filter((value): value is string => typeof value === "string")
        : undefined,
      pagination,
    };
  }

  private endpointDetails(
    stage: RouterRequestStage,
    path: string,
  ): RouterClientErrorDetails {
    return {
      stage,
      method: "GET",
      url: routerUrl(this.baseUrl, path),
      ...browserDetails(),
    };
  }

  private requestDetails(
    stage: RouterRequestStage,
    method: string,
    url: string,
    startedAt: number,
    extra: Partial<RouterClientErrorDetails> = {},
  ): RouterClientErrorDetails {
    return {
      stage,
      method,
      url,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      timedOut: false,
      ...browserDetails(),
      ...extra,
    };
  }

  private async requestJson<T>(
    pathOrUrl: string,
    init: RequestInit = {},
    options: RequestJsonOptions,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = options.absolute ? pathOrUrl : routerUrl(this.baseUrl, pathOrUrl);
    const method = String(init.method || "GET").toUpperCase();
    const startedAt = Date.now();

    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          ...init,
          credentials: "include",
          cache: "no-store",
          headers: { Accept: "application/json", ...(init.headers ?? {}) },
          signal: controller.signal,
        });
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        const timedOut = cause.name === "AbortError";
        const details = this.requestDetails(options.stage, method, url, startedAt, {
          timedOut,
          causeName: cause.name,
          causeMessage: cause.message,
        });
        console.error("[NineRouterClient] Fetch failed", details, cause);
        throw new RouterClientError(
          "OFFLINE",
          timedOut
            ? `Request to 9Router timed out during ${options.stage}.`
            : `Browser fetch failed during ${options.stage}. Open Technical details for the exact URL and cause.`,
          null,
          { cause, details },
        );
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const details = this.requestDetails(options.stage, method, url, startedAt);
        console.warn(
          `[NineRouterClient] ${options.stage} returned HTTP ${response.status}`,
          details,
        );

        if (response.status === 401) {
          throw new RouterClientError(
            "AUTH_REQUIRED",
            `Sign in to the 9Router dashboard at ${new URL(url).origin}, then refresh the extension.`,
            401,
            { details },
          );
        }
        if (response.status === 403) {
          throw new RouterClientError(
            "FORBIDDEN",
            `9Router denied the ${options.stage} request with HTTP 403.`,
            403,
            { details },
          );
        }
        throw new RouterClientError(
          "HTTP_ERROR",
          `9Router returned HTTP ${response.status} during ${options.stage}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
          response.status,
          { details },
        );
      }

      try {
        return (await response.json()) as T;
      } catch (error) {
        const cause = error instanceof Error ? error : new Error(String(error));
        const details = this.requestDetails(options.stage, method, url, startedAt, {
          causeName: cause.name,
          causeMessage: cause.message,
        });
        console.error("[NineRouterClient] JSON parsing failed", details, cause);
        throw new RouterClientError(
          "INVALID_RESPONSE",
          `9Router returned a non-JSON response during ${options.stage}.`,
          response.status,
          { cause, details },
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
