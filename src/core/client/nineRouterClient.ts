import { RouterClientError } from "./errors";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSemver(version: string): [number, number, number] | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
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
    const data = await this.requestJson<unknown>("api/health");
    if (!isRecord(data) || data.ok !== true) {
      throw new RouterClientError(
        "INVALID_RESPONSE",
        "9Router health endpoint returned an unexpected response.",
      );
    }
    return { ok: true };
  }

  async getVersion(): Promise<RouterVersionResponse> {
    const data = await this.requestJson<unknown>("api/version");
    if (!isRecord(data) || typeof data.currentVersion !== "string") {
      throw new RouterClientError(
        "INVALID_RESPONSE",
        "9Router version endpoint returned an unexpected response.",
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
      );
    }
    return version;
  }

  async getAuthStatus(): Promise<RouterAuthStatusResponse> {
    const data = await this.requestJson<unknown>("api/auth/status");
    if (!isRecord(data) || typeof data.requireLogin !== "boolean") {
      throw new RouterClientError(
        "INVALID_RESPONSE",
        "9Router auth status endpoint returned an unexpected response.",
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
      const data = await this.requestJson<unknown>(url.toString(), {}, true);
      const parsed = this.parseConnectionsResponse(data);
      allConnections.push(...parsed.connections);
      totalPages = Math.max(1, parsed.pagination?.totalPages ?? 1);
      page += 1;
    } while (page <= totalPages);

    return allConnections;
  }

  async getUsage(connectionId: string): Promise<RawUsageResponse> {
    if (!connectionId.trim()) {
      throw new RouterClientError("INVALID_RESPONSE", "Connection ID is required.");
    }
    const data = await this.requestJson<unknown>(
      `api/usage/${encodeURIComponent(connectionId)}`,
    );
    if (!isRecord(data)) {
      throw new RouterClientError(
        "INVALID_RESPONSE",
        "9Router usage endpoint returned an unexpected response.",
      );
    }
    return data;
  }

  private parseConnectionsResponse(data: unknown): ProviderConnectionsResponse {
    if (!isRecord(data) || !Array.isArray(data.connections)) {
      throw new RouterClientError(
        "INVALID_RESPONSE",
        "9Router provider endpoint returned an unexpected response.",
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

  private async requestJson<T>(
    pathOrUrl: string,
    init: RequestInit = {},
    absolute = false,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = absolute ? pathOrUrl : routerUrl(this.baseUrl, pathOrUrl);

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
        const timedOut = error instanceof DOMException && error.name === "AbortError";
        throw new RouterClientError(
          "OFFLINE",
          timedOut
            ? "The request to 9Router timed out."
            : "Unable to reach the local 9Router instance.",
          null,
          { cause: error instanceof Error ? error : undefined },
        );
      }

      if (response.status === 401) {
        throw new RouterClientError(
          "AUTH_REQUIRED",
          "Sign in to the 9Router dashboard, then refresh the extension.",
          401,
        );
      }
      if (response.status === 403) {
        throw new RouterClientError(
          "FORBIDDEN",
          "9Router denied access to this endpoint.",
          403,
        );
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new RouterClientError(
          "HTTP_ERROR",
          `9Router returned HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
          response.status,
        );
      }

      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new RouterClientError(
          "INVALID_RESPONSE",
          "9Router returned a non-JSON response.",
          response.status,
          { cause: error instanceof Error ? error : undefined },
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
