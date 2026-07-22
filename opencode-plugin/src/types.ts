export type JsonRecord = Record<string, unknown>

export type QuotaUnit = "percent" | "requests" | "tokens" | "credits" | "usd" | "unknown"
export type QuotaResetKind = "reset" | "expiry" | "none"
export type SnapshotStatus = "ok" | "partial" | "info" | "error"

export interface PluginConfig {
  baseUrl: string
  activeOnly: boolean
  refreshIntervalMs: number
  timeoutMs: number
  concurrency: number
  maxConnections: number
  maxRowsPerConnection: number
  allowRemote: boolean
  passwordEnv: string
  cookieEnv: string
}

export interface ProviderConnection {
  id: string
  provider: string
  authType?: string
  name?: string
  email?: string
  displayName?: string
  isActive?: boolean
  testStatus?: string
  lastError?: string
}

export interface QuotaBucket {
  key: string
  label: string
  used: number | null
  limit: number | null
  remainingValue: number | null
  remainingPercent: number | null
  unit: QuotaUnit
  unlimited: boolean
  resetAt: string | null
  resetKind: QuotaResetKind
  syntheticScale: boolean
}

export interface ConnectionQuotaSnapshot {
  connectionId: string
  provider: string
  accountLabel: string | null
  plan: string | null
  status: SnapshotStatus
  buckets: QuotaBucket[]
  message: string | null
}

export interface RouterSnapshot {
  routerVersion: string | null
  fetchedAt: string
  connections: ConnectionQuotaSnapshot[]
}

export type RouterErrorCode =
  | "OFFLINE"
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "INVALID_CONFIG"

export interface FetchLike {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>
}
