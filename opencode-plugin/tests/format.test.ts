import { describe, expect, it } from "vitest"
import { absoluteText, connectionSummary, progressBar, resetText } from "../src/format.js"
import type { ConnectionQuotaSnapshot, QuotaBucket } from "../src/types.js"

function bucket(overrides: Partial<QuotaBucket> = {}): QuotaBucket {
  return {
    key: "session",
    label: "Session",
    used: 60,
    limit: 100,
    remainingValue: 40,
    remainingPercent: 40,
    unit: "percent",
    unlimited: false,
    resetAt: null,
    resetKind: "none",
    syntheticScale: false,
    ...overrides,
  }
}

describe("quota formatting", () => {
  it("renders a bounded progress bar", () => {
    expect(progressBar(bucket({ remainingPercent: 40 }), 10)).toBe("████░░░░░░")
    expect(progressBar(bucket({ remainingPercent: 150 }), 10)).toBe("██████████")
  })

  it("labels recurring resets and one-shot expiry separately", () => {
    const resetAt = new Date(Date.UTC(2030, 0, 2, 0, 0, 0)).toISOString()
    const now = Date.UTC(2030, 0, 1, 0, 0, 0)

    expect(resetText(bucket({ resetAt, resetKind: "reset" }), now)).toBe("resets 1d")
    expect(resetText(bucket({ resetAt, resetKind: "expiry" }), now)).toBe("expires 1d")
  })

  it("does not expose a synthetic normalized scale as an absolute allowance", () => {
    expect(absoluteText(bucket({ syntheticScale: true, remainingValue: 420 }))).toBe("")
    expect(absoluteText(bucket({ unit: "credits", remainingValue: 348 }))).toBe("348 credits")
  })

  it("summarizes collapsed accounts with the lowest remaining quota", () => {
    const connection: ConnectionQuotaSnapshot = {
      connectionId: "account-1",
      provider: "codex",
      accountLabel: "user@example.com",
      plan: "plus",
      status: "ok",
      message: null,
      buckets: [bucket({ remainingPercent: 89 }), bucket({ key: "weekly", label: "Weekly", remainingPercent: 42 })],
    }

    expect(connectionSummary(connection)).toBe("2 quota rows · lowest 42% left")
  })
})
