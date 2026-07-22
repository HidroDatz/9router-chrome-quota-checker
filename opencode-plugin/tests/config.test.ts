import { describe, expect, it } from "vitest"
import { normalizeBaseUrl, parseConfig } from "../src/config.js"

describe("parseConfig", () => {
  it("uses safe loopback defaults", () => {
    expect(parseConfig(undefined)).toMatchObject({
      baseUrl: "http://127.0.0.1:20128",
      activeOnly: true,
      refreshIntervalMs: 60_000,
      passwordEnv: "NINE_ROUTER_PASSWORD",
    })
  })

  it("blocks remote origins by default", () => {
    expect(() => normalizeBaseUrl("https://router.example.com", false)).toThrow(/allowRemote/)
  })

  it("requires https for explicitly enabled remote origins", () => {
    expect(() => normalizeBaseUrl("http://router.example.com", true)).toThrow(/https/)
    expect(normalizeBaseUrl("https://router.example.com/", true)).toBe("https://router.example.com")
  })

  it("rejects credentials embedded in the URL", () => {
    expect(() => normalizeBaseUrl("http://user:pass@localhost:20128", false)).toThrow(/credentials/)
  })
})
