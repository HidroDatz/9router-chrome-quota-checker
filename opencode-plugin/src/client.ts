import { normalizeUsage } from "./normalize.js"
import type {
  FetchLike,
  JsonRecord,
  PluginConfig,
  ProviderConnection,
  RouterErrorCode,
  RouterSnapshot,
} from "./types.js"

export class NineRouterError extends Error {
  constructor(
    readonly code: RouterErrorCode,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message)
    this.name = "NineRouterError"
  }
}

function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function cookie(value: string | undefined) {
  if (!value?.trim()) return null
  const trimmed = value.trim()
  return trimmed.includes("auth_token=") ? trimmed : `auth_token=${trimmed}`
}

function message(value: unknown, fallback: string) {
  if (!record(value)) return fallback
  const candidate = value.error ?? value.message ?? value.detail
  return typeof candidate === "string" && candidate.trim() ? candidate.trim().slice(0, 400) : fallback
}

function connection(value: unknown): ProviderConnection | null {
  if (!record(value)) return null
  if (typeof value.id !== "string" || typeof value.provider !== "string") return null
  return {
    id: value.id,
    provider: value.provider,
    ...(typeof value.authType === "string" ? { authType: value.authType } : {}),
    ...(typeof value.name === "string" ? { name: value.name } : {}),
    ...(typeof value.email === "string" ? { email: value.email } : {}),
    ...(typeof value.displayName === "string" ? { displayName: value.displayName } : {}),
    ...(typeof value.isActive === "boolean" ? { isActive: value.isActive } : {}),
    ...(typeof value.testStatus === "string" ? { testStatus: value.testStatus } : {}),
    ...(typeof value.lastError === "string" ? { lastError: value.lastError } : {}),
  }
}

export async function mapLimit<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  worker: (value: Input, index: number) => Promise<Output>,
) {
  const output = new Array<Output>(values.length)
  let cursor = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor
        cursor += 1
        const value = values[index]
        if (value === undefined) continue
        output[index] = await worker(value, index)
      }
    }),
  )

  return output
}

export class NineRouterClient {
  private sessionCookie: string | null

  constructor(
    readonly config: PluginConfig,
    private readonly fetcher: FetchLike = fetch,
    private readonly environment: Record<string, string | undefined> = process.env,
  ) {
    this.sessionCookie = cookie(environment[config.cookieEnv])
  }

  private url(path: string) {
    return new URL(`${this.config.baseUrl}${path}`)
  }

  private async send(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const headers = new Headers(init.headers)
    headers.set("Accept", "application/json")
    if (this.sessionCookie) headers.set("Cookie", this.sessionCookie)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs)

    const response = await this.fetcher(this.url(path), {
      ...init,
      headers,
      signal: controller.signal,
    }).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error)
      throw new NineRouterError("OFFLINE", `Cannot reach 9Router: ${reason}`)
    }).finally(() => clearTimeout(timer))

    if (response.status !== 401 || !retry) return response
    if (!(await this.login())) return response
    return this.send(path, init, false)
  }

  private async login() {
    const password = this.environment[this.config.passwordEnv]
    if (!password) return false

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs)
    const response = await this.fetcher(this.url("/api/auth/login"), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    }).catch(() => null).finally(() => clearTimeout(timer))

    if (!response?.ok) return false
    const setCookie = response.headers.get("set-cookie")
    const match = /(?:^|,\s*)auth_token=([^;]+)/.exec(setCookie || "")
    if (!match?.[1]) return false
    this.sessionCookie = `auth_token=${match[1]}`
    return true
  }

  private async json(path: string, authCode: RouterErrorCode = "AUTH_REQUIRED") {
    const response = await this.send(path)
    const payload = await response.clone().json().catch(() => null)

    if (response.status === 401) {
      throw new NineRouterError(authCode, message(payload, "9Router authentication is required"), response.status)
    }
    if (response.status === 403) {
      throw new NineRouterError("FORBIDDEN", message(payload, "9Router rejected this request"), response.status)
    }
    if (!response.ok) {
      throw new NineRouterError("HTTP_ERROR", message(payload, `9Router returned HTTP ${response.status}`), response.status)
    }
    if (!record(payload)) {
      throw new NineRouterError("INVALID_RESPONSE", `9Router returned invalid JSON for ${path}`, response.status)
    }
    return payload
  }

  async health() {
    const value = await this.json("/api/health", "HTTP_ERROR")
    if (value.ok !== true) throw new NineRouterError("INVALID_RESPONSE", "9Router health check did not return ok: true")
  }

  async version() {
    const value = await this.json("/api/version", "HTTP_ERROR")
    return typeof value.currentVersion === "string" ? value.currentVersion : null
  }

  async connections() {
    const output: ProviderConnection[] = []

    for (let page = 1; page <= 100; page += 1) {
      const query = new URLSearchParams({
        accountStatus: this.config.activeOnly ? "active" : "all",
        sort: "priority",
        page: String(page),
        pageSize: "100",
      })
      const value = await this.json(`/api/providers/client?${query.toString()}`)
      const rows = Array.isArray(value.connections) ? value.connections : []
      output.push(...rows.map(connection).filter((item): item is ProviderConnection => item !== null))

      const pagination = record(value.pagination) ? value.pagination : null
      const totalPages = pagination && typeof pagination.totalPages === "number" ? pagination.totalPages : page
      if (page >= totalPages || rows.length === 0) break
    }

    return output
  }

  async usage(connectionId: string) {
    return this.json(`/api/usage/${encodeURIComponent(connectionId)}`, "HTTP_ERROR")
  }

  async snapshot(): Promise<RouterSnapshot> {
    await this.health()
    const [routerVersion, connections] = await Promise.all([this.version(), this.connections()])
    const snapshots = await mapLimit(connections, this.config.concurrency, async (item) => {
      const value = await this.usage(item.id).catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error)
        return { error: detail }
      })
      return normalizeUsage(item, value)
    })

    return {
      routerVersion,
      fetchedAt: new Date().toISOString(),
      connections: snapshots,
    }
  }
}
