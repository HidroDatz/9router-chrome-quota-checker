// SPDX-License-Identifier: GPL-3.0-or-later

const SYNTHETIC_PROVIDERS = new Set(['gemini-cli', 'antigravity']);
const CREDIT_PROVIDERS = new Set(['qoder', 'grok-cli', 'codebuddy-cn']);
const PERCENT_REMAINING_PROVIDERS = new Set(['claude', 'codex', 'glm', 'glm-cn']);

export function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

export function normalizeResetAt(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = toFiniteNumber(value);
  const source = numeric === null ? value : numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = new Date(source);
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : null;
}

export function providerName(value) {
  return String(value ?? '')
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function normalizeConnection(value) {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.provider !== 'string') return null;
  return {
    id: value.id,
    provider: value.provider.toLowerCase(),
    name: typeof value.name === 'string' ? value.name : null,
    email: typeof value.email === 'string' ? value.email : null,
    displayName: typeof value.displayName === 'string' ? value.displayName : null,
    isActive: typeof value.isActive === 'boolean' ? value.isActive : null,
  };
}

function accountLabel(connection) {
  for (const value of [connection.name, connection.email, connection.displayName]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function inferUnit(provider, key, row, total, synthetic) {
  const declared = typeof row.unit === 'string' ? row.unit.toLowerCase() : '';
  if (declared.includes('token')) return 'tokens';
  if (declared.includes('request') || declared.includes('interaction')) return 'requests';
  if (declared.includes('credit') || declared.includes('point')) return 'credits';
  if (declared.includes('usd') || declared.includes('dollar') || declared === '$') return 'usd';
  if (provider === 'vercel-ai-gateway' || /usd|balance \(\$\)/i.test(key)) return 'usd';
  if (CREDIT_PROVIDERS.has(provider)) return 'credits';
  if (synthetic || total === 100) return 'percent';
  return 'unknown';
}

function remainingPercent(provider, row, used, total, unlimited) {
  if (unlimited) return 100;
  const explicit = toFiniteNumber(row.remainingPercentage);
  if (explicit !== null) return clampPercent(explicit);
  if (used !== null && total !== null && total > 0) return clampPercent(((total - used) / total) * 100);
  const remaining = toFiniteNumber(row.remaining);
  if (remaining !== null && total !== null && total > 0) return clampPercent((remaining / total) * 100);
  if (PERCENT_REMAINING_PROVIDERS.has(provider) && remaining !== null) return clampPercent(remaining);
  return null;
}

function normalizeBucket(provider, key, value) {
  if (!isRecord(value)) return null;
  const syntheticScale = SYNTHETIC_PROVIDERS.has(provider);
  const used = toFiniteNumber(value.used);
  const limit = toFiniteNumber(value.total ?? value.limit);
  const unlimited = value.unlimited === true;
  const rawRemaining = toFiniteNumber(value.remaining);
  const remainingValue = syntheticScale
    ? null
    : rawRemaining ?? (used !== null && limit !== null ? Math.max(0, limit - used) : null);
  const resetAt = normalizeResetAt(value.resetAt ?? value.resetsAt ?? value.expiresAt);
  const label = typeof value.displayName === 'string' && value.displayName.trim() ? value.displayName.trim() : key;
  return {
    key,
    label,
    used,
    limit,
    remainingValue,
    remainingPercent: remainingPercent(provider, value, used, limit, unlimited),
    unit: inferUnit(provider, key, value, limit, syntheticScale),
    unlimited,
    resetAt,
    resetKind: resetAt ? (value.recurring === false ? 'expiry' : 'reset') : 'none',
    syntheticScale,
  };
}

function quotaEntries(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      if (!isRecord(entry)) return [];
      const key = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : String(index);
      return [[key, entry]];
    });
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).filter(([, row]) => isRecord(row));
}

export function normalizeUsage(connection, value, requestError = null) {
  if (!isRecord(value)) {
    return {
      connectionId: connection.id,
      provider: connection.provider,
      accountLabel: accountLabel(connection),
      plan: null,
      status: 'error',
      buckets: [],
      message: requestError || '9Router returned an invalid usage response',
    };
  }

  const error = requestError || (typeof value.error === 'string' ? value.error : null);
  const message = typeof value.message === 'string' && value.message.trim() ? value.message.trim() : null;
  const buckets = quotaEntries(value.quotas)
    .map(([key, row]) => normalizeBucket(connection.provider, key, row))
    .filter(Boolean);

  return {
    connectionId: connection.id,
    provider: connection.provider,
    accountLabel: accountLabel(connection),
    plan: typeof value.plan === 'string' && value.plan.trim() ? value.plan.trim() : null,
    status: error ? 'error' : buckets.length === 0 ? 'info' : message ? 'partial' : 'ok',
    buckets,
    message: error || message,
  };
}

export function summarizeConnections(connections, lowThreshold = 20) {
  const numeric = connections.flatMap((connection) =>
    connection.buckets
      .filter((bucket) => bucket.remainingPercent !== null)
      .map((bucket) => ({ connection, bucket })),
  );
  const lowest = numeric.length === 0
    ? null
    : Math.min(...numeric.map(({ bucket }) => bucket.remainingPercent));
  const low = new Set(
    numeric
      .filter(({ bucket }) => bucket.remainingPercent <= lowThreshold)
      .map(({ connection }) => connection.connectionId),
  ).size;
  return { lowest, low, numericCount: numeric.length, accountCount: connections.length };
}

export function groupConnections(connections) {
  const groups = new Map();
  for (const connection of connections) {
    if (!groups.has(connection.provider)) groups.set(connection.provider, []);
    groups.get(connection.provider).push(connection);
  }
  return [...groups.entries()].sort(([a], [b]) => providerName(a).localeCompare(providerName(b)));
}

export function formatRemaining(bucket) {
  if (bucket.unlimited) return 'unlimited';
  if (bucket.remainingPercent !== null) return `${Math.round(bucket.remainingPercent)}% left`;
  if (bucket.remainingValue === null) return 'unknown';
  const value = bucket.remainingValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (bucket.unit === 'usd') return `$${value}`;
  if (bucket.unit === 'unknown' || bucket.unit === 'percent') return value;
  return `${value} ${bucket.unit}`;
}

export function formatReset(bucket, now = Date.now()) {
  if (!bucket.resetAt) return '';
  const milliseconds = bucket.resetAt - now;
  if (!Number.isFinite(milliseconds)) return '';
  if (milliseconds <= 0) return bucket.resetKind === 'expiry' ? 'expired' : 'reset due';
  const minutes = Math.ceil(milliseconds / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const rest = minutes % 60;
  const parts = [
    days > 0 ? `${days}d` : '',
    hours > 0 ? `${hours}h` : '',
    days === 0 && rest > 0 ? `${rest}m` : '',
  ].filter(Boolean).join(' ');
  return `${bucket.resetKind === 'expiry' ? 'expires' : 'resets'} ${parts}`;
}
