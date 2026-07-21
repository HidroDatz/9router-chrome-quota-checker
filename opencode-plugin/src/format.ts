import type { ConnectionQuotaSnapshot, QuotaBucket } from "./types.js"

export function providerName(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function connectionName(connection: ConnectionQuotaSnapshot) {
  return connection.accountLabel ? `${providerName(connection.provider)} · ${connection.accountLabel}` : providerName(connection.provider)
}

export function remainingText(bucket: QuotaBucket) {
  if (bucket.unlimited) return "unlimited"
  if (bucket.remainingPercent === null) return "unknown"
  return `${Math.round(bucket.remainingPercent)}% left`
}

export function progressBar(bucket: QuotaBucket, width = 10) {
  if (bucket.remainingPercent === null) return "·".repeat(width)
  const filled = Math.round((Math.max(0, Math.min(100, bucket.remainingPercent)) / 100) * width)
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`
}

export function resetText(bucket: QuotaBucket, now = Date.now()) {
  if (!bucket.resetAt) return ""
  const milliseconds = new Date(bucket.resetAt).getTime() - now
  if (!Number.isFinite(milliseconds)) return ""
  if (milliseconds <= 0) return bucket.resetKind === "expiry" ? "expired" : "reset due"

  const minutes = Math.ceil(milliseconds / 60_000)
  const days = Math.floor(minutes / 1_440)
  const hours = Math.floor((minutes % 1_440) / 60)
  const rest = minutes % 60
  const parts = [days > 0 ? `${days}d` : "", hours > 0 ? `${hours}h` : "", days === 0 && rest > 0 ? `${rest}m` : ""]
    .filter(Boolean)
    .join(" ")
  return `${bucket.resetKind === "expiry" ? "expires" : "resets"} ${parts}`
}

export function absoluteText(bucket: QuotaBucket) {
  if (bucket.syntheticScale || bucket.unlimited) return ""
  if (bucket.remainingValue === null) return ""

  const value = bucket.remainingValue.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (bucket.unit === "usd") return `$${value}`
  if (bucket.unit === "unknown" || bucket.unit === "percent") return value
  return `${value} ${bucket.unit}`
}
