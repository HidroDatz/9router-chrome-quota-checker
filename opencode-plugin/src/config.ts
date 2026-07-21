import type { PluginConfig } from "./types.js"

const DEFAULTS: PluginConfig = {
  baseUrl: "http://127.0.0.1:20128",
  activeOnly: true,
  refreshIntervalMs: 60_000,
  timeoutMs: 15_000,
  concurrency: 4,
  maxConnections: 10,
  maxRowsPerConnection: 3,
  allowRemote: false,
  passwordEnv: "NINE_ROUTER_PASSWORD",
  cookieEnv: "NINE_ROUTER_AUTH_COOKIE",
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

function flag(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function environmentName(value: unknown, fallback: string) {
  const next = text(value, fallback)
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(next)) return next
  throw new Error(`Invalid environment variable name: ${next}`)
}

export function normalizeBaseUrl(value: string, allowRemote: boolean) {
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("9Router URL must use http or https")
  }
  if (url.username || url.password) {
    throw new Error("Do not place credentials in the 9Router URL")
  }
  if (url.search || url.hash) {
    throw new Error("9Router URL must not contain a query string or fragment")
  }

  const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
  if (!loopback.has(url.hostname)) {
    if (!allowRemote) throw new Error("Remote 9Router origins require allowRemote: true")
    if (url.protocol !== "https:") throw new Error("Remote 9Router origins must use https")
  }

  const path = url.pathname.replace(/\/+$/, "")
  return `${url.origin}${path}`
}

export function parseConfig(input: unknown): PluginConfig {
  const options = record(input) ? input : {}
  const allowRemote = flag(options.allowRemote, DEFAULTS.allowRemote)

  return {
    baseUrl: normalizeBaseUrl(text(options.baseUrl, DEFAULTS.baseUrl), allowRemote),
    activeOnly: flag(options.activeOnly, DEFAULTS.activeOnly),
    refreshIntervalMs: integer(options.refreshIntervalMs, DEFAULTS.refreshIntervalMs, 30_000, 3_600_000),
    timeoutMs: integer(options.timeoutMs, DEFAULTS.timeoutMs, 1_000, 120_000),
    concurrency: integer(options.concurrency, DEFAULTS.concurrency, 1, 10),
    maxConnections: integer(options.maxConnections, DEFAULTS.maxConnections, 1, 100),
    maxRowsPerConnection: integer(options.maxRowsPerConnection, DEFAULTS.maxRowsPerConnection, 1, 20),
    allowRemote,
    passwordEnv: environmentName(options.passwordEnv, DEFAULTS.passwordEnv),
    cookieEnv: environmentName(options.cookieEnv, DEFAULTS.cookieEnv),
  }
}
