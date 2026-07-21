# Provider quota matrix

The extension discovers providers dynamically from `/api/providers/client`. This table describes current normalization behavior rather than acting as a hardcoded allow-list.

| Provider | 9Router quota source | Extension representation | Notes |
|---|---|---|---|
| GitHub Copilot | `quota_snapshots` or free-plan monthly fields | Requests/interactions | Numeric quota and monthly reset when supplied |
| Gemini CLI | Cloud Code Assist `retrieveUserQuota` | Percentage | `total=1000` is synthetic; counts are not displayed as real requests |
| Antigravity | Google Cloud Code quota API | Percentage per model | Synthetic scale; `displayName` is preferred |
| Claude Code | OAuth usage windows, legacy fallback | Percentage | Session/weekly windows; minimum refresh policy is 180 seconds |
| OpenAI Codex | Primary/secondary rate-limit windows | Percentage | Session, weekly, and optional review windows |
| Kiro | CodeWhisperer/Amazon Q usage-limit endpoints | Requests | May return an informational auth message while chat still works |
| Qoder | User and organization credit packages | Credits | Absolute `remaining` is converted using `used/total`, never treated as percent |
| Qwen | No numeric usage endpoint in current handler | Information only | No fake progress bar |
| iFlow | No numeric usage endpoint in current handler | Information only | No fake progress bar |
| Ollama Cloud | No public usage endpoint | Information only | No fake progress bar |
| GLM / GLM CN | Region-specific coding-plan limit endpoint | Percentage | Uses upstream percentage and reset timestamp |
| MiniMax / MiniMax CN | Coding/token-plan remains endpoints | Requests/counts or percentage | Supports count-based and percent-only M-series buckets |
| Vercel AI Gateway | Credit balance endpoint | USD | Balance is retained as currency; current 9Router percent may rely on a $5 assumption |
| CodeBuddy CN | Tencent billing packages | Credits | Recurring packages reset; bonus packages expire |
| Grok CLI | Billing and subscription endpoints | Credits | Included, on-demand, prepaid, or generic credit buckets |

## Generic provider fallback

If a future 9Router provider appears with a `quotas` object, the extension attempts to normalize each object-valued entry using:

1. `remainingPercentage` when provided.
2. `(total - used) / total` when numeric counts exist.
3. `remaining / total` when only an absolute remainder and total exist.
4. No percentage when the response is insufficient.

Unknown providers are not rejected merely because their ID is absent from the policy map.

## Percentage versus absolute values

The normalized schema intentionally separates:

```text
remainingValue    absolute requests/tokens/credits/USD
remainingPercent  progress-bar percentage from 0 to 100
```

This avoids the ambiguity present in provider payloads where a field named `remaining` can mean either a percentage or an absolute balance.
