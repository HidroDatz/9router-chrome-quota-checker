import { describe, expect, it } from "vitest"
import { normalizeUsage } from "../src/normalize.js"

const connection = (provider: string) => ({ id: `id-${provider}`, provider, name: "demo@example.com" })

describe("normalizeUsage", () => {
  it("normalizes percent windows", () => {
    const value = normalizeUsage(connection("claude"), {
      plan: "Claude Code",
      quotas: {
        "session (5h)": { used: 87, total: 100, remaining: 13, resetAt: "2030-01-01T00:00:00Z" },
      },
    })

    expect(value.buckets[0]?.remainingPercent).toBe(13)
    expect(value.buckets[0]?.unit).toBe("percent")
  })

  it("does not treat absolute Qoder credits as a percentage", () => {
    const value = normalizeUsage(connection("qoder"), {
      quotas: {
        user: { used: 152, total: 500, remaining: 348, unit: "credits" },
      },
    })

    expect(value.buckets[0]?.remainingValue).toBe(348)
    expect(value.buckets[0]?.remainingPercent).toBeCloseTo(69.6)
  })

  it("marks Gemini quota as a synthetic scale", () => {
    const value = normalizeUsage(connection("gemini-cli"), {
      quotas: {
        "gemini-3-flash": { used: 580, total: 1000, remainingPercentage: 42 },
      },
    })

    expect(value.buckets[0]).toMatchObject({ syntheticScale: true, remainingPercent: 42 })
  })

  it("distinguishes one-shot package expiry from reset", () => {
    const value = normalizeUsage(connection("codebuddy-cn"), {
      quotas: {
        "Bonus Pack 1": { used: 20, total: 100, recurring: false, resetAt: "2030-01-01T00:00:00Z" },
      },
    })

    expect(value.buckets[0]?.resetKind).toBe("expiry")
  })

  it("keeps informational providers without fake quota rows", () => {
    const value = normalizeUsage(connection("iflow"), {
      message: "iFlow connected. Usage tracked per request.",
    })

    expect(value.status).toBe("info")
    expect(value.buckets).toEqual([])
  })
})
