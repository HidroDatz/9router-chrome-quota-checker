import type { QuotaUnit } from "./types";

export interface ProviderPolicy {
  defaultUnit: QuotaUnit;
  syntheticScale?: boolean;
  informationalOnly?: boolean;
  minRefreshMs?: number;
  remainingFieldIsPercent?: boolean;
}

const DEFAULT_POLICY: ProviderPolicy = {
  defaultUnit: "unknown",
  minRefreshMs: 60_000,
};

const PROVIDER_POLICIES: Record<string, ProviderPolicy> = {
  github: { defaultUnit: "requests", minRefreshMs: 60_000 },
  "gemini-cli": { defaultUnit: "percent", syntheticScale: true, minRefreshMs: 60_000 },
  antigravity: { defaultUnit: "percent", syntheticScale: true, minRefreshMs: 60_000 },
  claude: { defaultUnit: "percent", minRefreshMs: 180_000, remainingFieldIsPercent: true },
  codex: { defaultUnit: "percent", minRefreshMs: 60_000, remainingFieldIsPercent: true },
  kiro: { defaultUnit: "requests", minRefreshMs: 60_000 },
  qoder: { defaultUnit: "credits", minRefreshMs: 60_000 },
  qwen: { defaultUnit: "unknown", informationalOnly: true, minRefreshMs: 15 * 60_000 },
  iflow: { defaultUnit: "unknown", informationalOnly: true, minRefreshMs: 15 * 60_000 },
  ollama: { defaultUnit: "unknown", informationalOnly: true, minRefreshMs: 15 * 60_000 },
  glm: { defaultUnit: "percent", minRefreshMs: 60_000, remainingFieldIsPercent: true },
  "glm-cn": { defaultUnit: "percent", minRefreshMs: 60_000, remainingFieldIsPercent: true },
  minimax: { defaultUnit: "requests", minRefreshMs: 60_000 },
  "minimax-cn": { defaultUnit: "requests", minRefreshMs: 60_000 },
  "vercel-ai-gateway": { defaultUnit: "usd", minRefreshMs: 60_000 },
  "codebuddy-cn": { defaultUnit: "credits", minRefreshMs: 60_000 },
  "grok-cli": { defaultUnit: "credits", minRefreshMs: 60_000 },
};

export function getProviderPolicy(provider: string): ProviderPolicy {
  return PROVIDER_POLICIES[provider.toLowerCase()] ?? DEFAULT_POLICY;
}
