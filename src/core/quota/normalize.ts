import { getProviderPolicy } from "./providerPolicies";
import type {
  ConnectionQuotaSnapshot,
  ProviderConnection,
  QuotaBucket,
  QuotaResetKind,
  QuotaUnit,
  RawUsageResponse,
  SnapshotStatus,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function normalizeResetAt(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  let date: Date;
  if (typeof value === "number") {
    date = new Date(value < 1e12 ? value * 1000 : value);
  } else if (typeof value === "string" && /^\d+$/.test(value)) {
    const numeric = Number(value);
    date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
  } else if (typeof value === "string") {
    date = new Date(value);
  } else {
    return null;
  }
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function getQuotaEntries(rawQuotas: unknown): Array<[string, Record<string, unknown>]> {
  if (Array.isArray(rawQuotas)) {
    return rawQuotas.flatMap((entry, index) => {
      if (!isRecord(entry)) return [];
      const key =
        typeof entry.name === "string" && entry.name.trim()
          ? entry.name.trim()
          : String(index);
      return [[key, entry] as [string, Record<string, unknown>]];
    });
  }
  if (!isRecord(rawQuotas)) return [];
  return Object.entries(rawQuotas).flatMap(([key, value]) =>
    isRecord(value) ? ([[key, value]] as Array<[string, Record<string, unknown>]>) : [],
  );
}

function normalizeUnit(value: unknown): QuotaUnit | null {
  if (typeof value !== "string") return null;
  const unit = value.trim().toLowerCase();
  if (!unit) return null;
  if (unit.includes("percent") || unit === "%") return "percent";
  if (unit.includes("request") || unit.includes("interaction")) return "requests";
  if (unit.includes("token")) return "tokens";
  if (unit.includes("credit") || unit.includes("point")) return "credits";
  if (unit.includes("usd") || unit.includes("dollar") || unit === "$") return "usd";
  return "unknown";
}

function inferUnit(provider: string, key: string, quota: Record<string, unknown>): QuotaUnit {
  const explicit = normalizeUnit(quota.unit);
  if (explicit && explicit !== "unknown") return explicit;
  if (key.toLowerCase().includes("usd")) return "usd";
  return getProviderPolicy(provider).defaultUnit;
}

function inferLabel(provider: string, key: string, quota: Record<string, unknown>): string {
  if (typeof quota.displayName === "string" && quota.displayName.trim()) {
    return quota.displayName.trim();
  }
  if (provider === "qoder") {
    if (key === "user") return "Personal";
    if (key === "organization") return "Organization";
  }
  return key;
}

function inferResetKind(resetAt: string | null, quota: Record<string, unknown>): QuotaResetKind {
  if (!resetAt) return "none";
  return quota.recurring === false ? "expiry" : "reset";
}

function accountLabel(connection: ProviderConnection): string | null {
  for (const value of [connection.name, connection.email, connection.displayName]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function classifyMessage(message: string | null, hasBuckets: boolean): SnapshotStatus {
  if (hasBuckets && message) return "partial";
  if (hasBuckets) return "ok";
  if (!message) return "info";
  const authLike = /expired|authentication|unauthorized|invalid api key|re-authorize|\b401\b/i;
  return authLike.test(message) ? "auth-required" : "info";
}

function normalizeBucket(
  provider: string,
  key: string,
  quota: Record<string, unknown>,
): QuotaBucket {
  const policy = getProviderPolicy(provider);
  let used = toFiniteNumber(quota.used);
  const limit = toFiniteNumber(quota.total ?? quota.limit);
  const rawRemaining = toFiniteNumber(quota.remaining);
  const upstreamRemainingPercent = toFiniteNumber(quota.remainingPercentage);
  const unlimited = quota.unlimited === true;
  const unit = inferUnit(provider, key, quota);

  let remainingPercent: number | null = null;
  if (unlimited) remainingPercent = 100;
  else if (upstreamRemainingPercent !== null) remainingPercent = clampPercent(upstreamRemainingPercent);
  else if (limit !== null && limit > 0 && used !== null) {
    remainingPercent = clampPercent(((limit - used) / limit) * 100);
  } else if (limit !== null && limit > 0 && rawRemaining !== null) {
    remainingPercent = clampPercent((rawRemaining / limit) * 100);
  } else if (policy.remainingFieldIsPercent && rawRemaining !== null) {
    remainingPercent = clampPercent(rawRemaining);
  }

  let remainingValue: number | null = null;
  if (unit !== "percent" && !policy.syntheticScale) {
    if (rawRemaining !== null && !policy.remainingFieldIsPercent) {
      remainingValue = Math.max(0, rawRemaining);
    } else if (limit !== null && used !== null) {
      remainingValue = Math.max(0, limit - used);
    }
  }

  if (provider === "vercel-ai-gateway" && key.toLowerCase().includes("remaining")) {
    const balance = rawRemaining ?? used;
    if (balance !== null) remainingValue = Math.max(0, balance);
    used = null;
  }

  const resetAt = normalizeResetAt(quota.resetAt ?? quota.resetsAt ?? quota.expiresAt);
  return {
    key,
    label: inferLabel(provider, key, quota),
    used,
    limit,
    remainingValue,
    remainingPercent,
    unit,
    unlimited,
    resetAt,
    resetKind: inferResetKind(resetAt, quota),
    syntheticScale: policy.syntheticScale === true,
  };
}

export interface NormalizeUsageOptions {
  fetchedAt?: string;
  routerVersion?: string | null;
}

export function normalizeUsageResponse(
  connection: ProviderConnection,
  data: RawUsageResponse,
  options: NormalizeUsageOptions = {},
): ConnectionQuotaSnapshot {
  const provider = connection.provider.toLowerCase();
  const entries = getQuotaEntries(data.quotas).filter(([key, quota]) => {
    if (provider !== "qoder" || key !== "organization") return true;
    return (toFiniteNumber(quota.total) ?? 0) > 0;
  });
  const buckets = entries.map(([key, quota]) => normalizeBucket(provider, key, quota));
  const rawMessage = data.message ?? data.error;
  const message = typeof rawMessage === "string" && rawMessage.trim() ? rawMessage.trim() : null;
  const plan = typeof data.plan === "string" && data.plan.trim() ? data.plan.trim() : null;
  return {
    schemaVersion: 1,
    connectionId: connection.id,
    provider,
    accountLabel: accountLabel(connection),
    plan,
    status: classifyMessage(message, buckets.length > 0),
    buckets,
    message: message ?? (buckets.length === 0 ? "No numeric quota data was returned." : null),
    fetchedAt: options.fetchedAt ?? new Date().toISOString(),
    routerVersion: options.routerVersion ?? null,
  };
}
