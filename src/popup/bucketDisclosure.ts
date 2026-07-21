import type { QuotaBucket } from "../core/quota/types";

function lowestRemainingBucket(buckets: QuotaBucket[]): QuotaBucket {
  return buckets.reduce((lowest, bucket) => {
    if (lowest.remainingPercent === null) return bucket.remainingPercent === null ? lowest : bucket;
    if (bucket.remainingPercent === null) return lowest;
    return bucket.remainingPercent < lowest.remainingPercent ? bucket : lowest;
  });
}

export function visibleBuckets(buckets: QuotaBucket[], expanded: boolean): QuotaBucket[] {
  if (expanded || buckets.length <= 1) return buckets;
  return [lowestRemainingBucket(buckets)];
}
