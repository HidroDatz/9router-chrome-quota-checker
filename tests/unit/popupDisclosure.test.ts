import { describe, expect, it } from "vitest";
import { visibleBuckets } from "../../src/popup/bucketDisclosure";
import type { QuotaBucket } from "../../src/core/quota/types";

function bucket(key: string, remainingPercent: number | null): QuotaBucket {
  return {
    key,
    label: key,
    used: null,
    limit: null,
    remainingValue: null,
    remainingPercent,
    unit: "percent",
    unlimited: false,
    resetAt: null,
    resetKind: "none",
    syntheticScale: false,
  };
}

describe("popup bucket disclosure", () => {
  it("shows the lowest remaining bucket when a multi-bucket provider is collapsed", () => {
    expect(visibleBuckets([bucket("daily", 90), bucket("monthly", 24), bucket("weekly", 50)], false).map((item) => item.key)).toEqual(["monthly"]);
  });

  it("keeps all buckets visible when expanded or when only one bucket exists", () => {
    const buckets = [bucket("daily", 90), bucket("monthly", 24)];
    expect(visibleBuckets(buckets, true)).toBe(buckets);
    expect(visibleBuckets([bucket("single", 40)], false).map((item) => item.key)).toEqual(["single"]);
  });

  it("falls back to the first bucket when collapsed buckets have no percent", () => {
    expect(visibleBuckets([bucket("first", null), bucket("second", null)], false).map((item) => item.key)).toEqual(["first"]);
  });
});
