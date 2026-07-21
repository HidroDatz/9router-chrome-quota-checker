import { describe, expect, it } from "vitest"
import { NineRouterClient, mapLimit } from "../src/client.js"
import { parseConfig } from "../src/config.js"

function json(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("content-type", "application/json")
  return new Response(JSON.stringify(value), {
    ...init,
    status: init.status ?? 200,
    headers,
  })
}

describe("NineRouterClient", () => {
  it("logs in from an environment variable and keeps the cookie in memory", async () => {
    const seen: string[] = []
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input.toString())
      const headers = new Headers(init?.headers)
      seen.push(`${url.pathname}:${headers.get("cookie") || "none"}`)

      if (url.pathname === "/api/health") return json({ ok: true })
      if (url.pathname === "/api/version") return json({ currentVersion: "0.5.40" })
      if (url.pathname === "/api/auth/login") {
        expect(init?.body).toBe(JSON.stringify({ password: "secret" }))
        return json({ success: true }, { headers: { "set-cookie": "auth_token=signed.jwt; HttpOnly; Path=/" } })
      }
      if (url.pathname === "/api/providers/client" && !headers.get("cookie")) {
        return json({ error: "Unauthorized" }, { status: 401 })
      }
      if (url.pathname === "/api/providers/client") {
        return json({
          connections: [{ id: "abc", provider: "claude", name: "me@example.com" }],
          pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
        })
      }
      if (url.pathname === "/api/usage/abc") {
        expect(headers.get("cookie")).toBe("auth_token=signed.jwt")
        return json({ quotas: { session: { used: 50, total: 100 } } })
      }
      return json({ error: "not found" }, { status: 404 })
    }

    const client = new NineRouterClient(parseConfig(undefined), fetcher, { NINE_ROUTER_PASSWORD: "secret" })
    const snapshot = await client.snapshot()

    expect(snapshot.routerVersion).toBe("0.5.40")
    expect(snapshot.connections[0]?.buckets[0]?.remainingPercent).toBe(50)
    expect(seen).toContain("/api/providers/client:none")
    expect(seen).toContain("/api/providers/client:auth_token=signed.jwt")
  })

  it("reports an authentication requirement when no credential source is configured", async () => {
    const fetcher: typeof fetch = async () => json({ error: "Unauthorized" }, { status: 401 })
    const client = new NineRouterClient(parseConfig(undefined), fetcher, {})

    await expect(client.connections()).rejects.toMatchObject({ code: "AUTH_REQUIRED", status: 401 })
  })

  it("limits concurrent provider requests", async () => {
    let active = 0
    let maximum = 0
    const output = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (value) => {
      active += 1
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return value * 2
    })

    expect(maximum).toBe(2)
    expect(output).toEqual([2, 4, 6, 8, 10, 12])
  })
})
