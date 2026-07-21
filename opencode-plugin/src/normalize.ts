import type {
  ConnectionQuotaSnapshot,
  JsonRecord,
  ProviderConnection,
  QuotaBucket,
  QuotaUnit,
} from "./types.js"

const SYNTHETIC_PROVIDERS = new Set(["gemini-cli", "antigravity"])
const CREDIT_PROVIDERS = new Set(["qoder", "grok-cli", "codebuddy-cn"])

function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value))
}

function date(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null
  const numeric = number(value)
  const source = numeric === null ? value : numeric < 1e12 ? numeric * 1000 : numeric
  const parsed = new Date(source as string | number)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

function unit(provider: string, name: string, row: JsonRecord, total: number | null, synthetic: boolean): QuotaUnit {
  const declared = typeof row.unit === "string" ? row.unit.toLowerCase() : ""
  if (declared.includes("token")) return "tokens"
  if (declared.includes("request")) return "requests"
  if (declared.includes("credit")) return "credits"
  if (declared.includes("usd") || declared.includes("dollar")) return "usd"
  if (provider === "vercel-ai-gateway" || /usd|balance \(\$\)/i.test(name)) return "usd"
  if (CREDIT_PROVIDERS.has(provider)) return "credits"
  if (synthetic || total === 100) return "percent"
  return "unknown"
}

function remainingPercent(row: JsonRecord, used: number | null, total: number | null, unlimited: boolean) {
  if (unlimited) return 100

  const explicit = number(row.remainingPercentage)
  if (explicit !== null) return clamp(explicit)

  if (used !== null && total !== null && total > 0) {
    return clamp(((total - used) / total) * 100)
  }

  const remaining = number(row.remaining)
  if (remaining !== null && total !== null && total > 0) {
    return clamp((remaining / total) * 100)
  }

  return null
}

function normalizeBucket(provider: string, key: string, value: unknown): QuotaBucket | null {
  if (!record(value)) return null

  const syntheticScale = SYNTHETIC_PROVIDERS.has(provider)
  const used = number(value.used)
  const limit = number(value.total)
  const unlimited = value.unlimited === true
  const remainingValue = number(value.remaining) ?? (used !== null && limit !== null ? Math.max(0, limit - used) : null)
  const resetAt = date(value.resetAt)
  const label = typeof value.displayName === "string" && value.displayName.trim() ? value.displayName.trim() : key

  return {
    key,
    label,
    used,
    limit,
    remainingValue,
    remainingPercent: remainingPercent(value, used, limit, unlimited),
    unit: unit(provider, key, value, limit, syntheticScale),
    unlimited,
    resetAt,
    resetKind: resetAt ? (value.recurring === false ? "expiry" : "reset") : "none",
    syntheticScale,
  }
}

function accountLabel(connection: ProviderConnection) {
  return connection.name?.trim() || connection.email?.trim() || connection.displayName?.trim() || null
}

export function normalizeUsage(
  connection: ProviderConnection,
  value: unknown,
  requestError: string | null = null,
): ConnectionQuotaSnapshot {
  if (!record(value)) {
    return {
      connectionId: connection.id,
      provider: connection.provider,
      accountLabel: accountLabel(connection),
      plan: null,
      status: "error",
      buckets: [],
      message: requestError || "9Router returned an invalid usage response",
    }
  }

  const message = requestError || (typeof value.message === "string" ? value.message : null)
  const error = typeof value.error === "string" ? value.error : null
  const quotas = record(value.quotas) ? value.quotas : {}
  const buckets = Object.entries(quotas)
    .map(([key, quota]) => normalizeBucket(connection.provider, key, quota))
    .filter((bucket): bucket is QuotaBucket => bucket !== null)

  return {
    connectionId: connection.id,
    provider: connection.provider,
    accountLabel: accountLabel(connection),
    plan: typeof value.plan === "string" && value.plan.trim() ? value.plan.trim() : null,
    status: error || requestError ? "error" : buckets.length === 0 ? "info" : message ? "partial" : "ok",
    buckets,
    message: error || message,
  }
}
