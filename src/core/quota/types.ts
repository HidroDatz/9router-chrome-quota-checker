export type QuotaUnit =
  | "percent"
  | "requests"
  | "tokens"
  | "credits"
  | "usd"
  | "unknown";

export type QuotaResetKind = "reset" | "expiry" | "none";

export type SnapshotStatus =
  | "ok"
  | "partial"
  | "info"
  | "auth-required"
  | "offline"
  | "error";

export interface ExtensionSettings {
  baseUrl: string;
  activeOnly: boolean;
}

export interface ProviderConnection {
  id: string;
  provider: string;
  authType?: string;
  name?: string;
  email?: string;
  displayName?: string;
  priority?: number;
  globalPriority?: number;
  isActive?: boolean;
  defaultModel?: string;
  testStatus?: string;
  lastError?: string;
  lastErrorAt?: string;
  errorCode?: string;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  providerSpecificData?: Record<string, unknown>;
}

export interface ProviderConnectionsResponse {
  connections: ProviderConnection[];
  providerOptions?: string[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  totals?: {
    eligibleConnections: number;
    providerFilteredConnections: number;
  };
}

export interface RouterHealthResponse {
  ok: boolean;
}

export interface RouterVersionResponse {
  currentVersion: string;
  latestVersion?: string | null;
  hasUpdate?: boolean;
}

export interface RouterAuthStatusResponse {
  requireLogin: boolean;
  authMode?: string;
  oidcConfigured?: boolean;
  displayName?: string;
  loginMethod?: string;
}

export type RawUsageResponse = Record<string, unknown>;

export interface QuotaBucket {
  key: string;
  label: string;
  used: number | null;
  limit: number | null;
  remainingValue: number | null;
  remainingPercent: number | null;
  unit: QuotaUnit;
  unlimited: boolean;
  resetAt: string | null;
  resetKind: QuotaResetKind;
  syntheticScale: boolean;
}

export interface ConnectionQuotaSnapshot {
  schemaVersion: 1;
  connectionId: string;
  provider: string;
  accountLabel: string | null;
  plan: string | null;
  status: SnapshotStatus;
  buckets: QuotaBucket[];
  message: string | null;
  fetchedAt: string;
  routerVersion: string | null;
}

export interface QuotaCache {
  schemaVersion: 1;
  baseUrl: string;
  routerVersion: string | null;
  fetchedAt: string;
  connections: ConnectionQuotaSnapshot[];
}

export interface RouterProbeResult {
  health: RouterHealthResponse;
  version: RouterVersionResponse;
  connectionCount: number;
}
