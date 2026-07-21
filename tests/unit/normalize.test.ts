import { describe, expect, it } from "vitest";
import fixtures from "../fixtures/provider-usage.json";
import { normalizeUsageResponse } from "../../src/core/quota/normalize";
import type { ProviderConnection, RawUsageResponse } from "../../src/core/quota/types";

function normalize(provider: keyof typeof fixtures) {
  const connection: ProviderConnection = { id: `${provider}-1`, provider, email: `${provider}@example.test` };
  return normalizeUsageResponse(connection, fixtures[provider] as RawUsageResponse, { fetchedAt: "2026-07-21T12:00:00.000Z", routerVersion: "0.5.40" });
}

describe("quota normalization", () => {
  it("converts Claude utilization into remaining percent", () => {
    const result = normalize("claude");
    expect(result.buckets[0]?.remainingPercent).toBe(13);
    expect(result.buckets[0]?.unit).toBe("percent");
  });

  it("marks Gemini and Antigravity scales as synthetic", () => {
    expect(normalize("gemini-cli").buckets[0]).toMatchObject({ remainingPercent: 42, syntheticScale: true, remainingValue: null });
    expect(normalize("antigravity").buckets[0]?.syntheticScale).toBe(true);
  });

  it("does not interpret absolute Qoder credits as a percentage", () => {
    const bucket = normalize("qoder").buckets[0];
    expect(bucket).toMatchObject({ label: "Personal", remainingValue: 348, remainingPercent: 69.6, unit: "credits" });
    expect(bucket?.remainingPercent).not.toBe(348);
  });

  it("distinguishes CodeBuddy reset packages from expiring bonuses", () => {
    const buckets = normalize("codebuddy-cn").buckets;
    expect(buckets.find((bucket) => bucket.key === "Monthly")?.resetKind).toBe("reset");
    expect(buckets.find((bucket) => bucket.key === "Bonus Pack 1")?.resetKind).toBe("expiry");
  });

  it("keeps Vercel balances in USD", () => {
    const remaining = normalize("vercel-ai-gateway").buckets.find((bucket) => bucket.key === "Remaining (USD)");
    expect(remaining).toMatchObject({ unit: "usd", remainingValue: 4.5, remainingPercent: 90 });
  });

  it("returns informational snapshots without fake progress bars", () => {
    for (const provider of ["qwen", "iflow", "ollama"] as const) {
      const result = normalize(provider);
      expect(result.status).toBe("info");
      expect(result.buckets).toHaveLength(0);
      expect(result.message).toBeTruthy();
    }
  });

  it("normalizes every implemented 9Router usage handler fixture", () => {
    for (const provider of Object.keys(fixtures) as Array<keyof typeof fixtures>) {
      const result = normalize(provider);
      expect(result.provider).toBe(provider);
      expect(result.schemaVersion).toBe(1);
      expect(result.status).not.toBe("error");
    }
  });
});
