# 9Router Chrome Quota Checker

A read-only Manifest V3 Chrome extension that displays quota for provider connections already configured in a local [9Router](https://github.com/decolua/9router) instance.

The extension deliberately delegates credentials, OAuth refresh, connection proxies, and provider-specific quota calls to 9Router. It consumes only the sanitized connection endpoint and the normalized usage endpoint exposed by the local dashboard.

## OpenCode integration

The repository also contains a read-only [OpenCode TUI plugin](opencode-plugin/README.md). It renders provider quota in `sidebar_content`, registers a `/9router-quota` command, and opens a detailed quota dialog without reading OpenCode's provider credentials.

The plugin treats 9Router as the quota aggregation boundary. Authentication is supplied through environment variables, and the resulting dashboard cookie remains in process memory rather than being written to disk. See [the OpenCode integration research](opencode-plugin/RESEARCH.md) for the upstream design analysis and overlap with native OpenCode usage tracking.

## GNOME top-panel integration

The repository includes a native [GNOME Shell quota indicator](gnome-extension/README.md) for GNOME 45–50. It adds an `9R` indicator to the Linux top panel, shows the lowest remaining quota, exposes collapsible provider/account menus, refreshes in the background, and can notify when a quota bucket becomes low.

Dashboard passwords and cookies are stored in GNOME Keyring. The Shell extension does not store or request credentials for Claude, Codex, Gemini, Copilot, GLM, MiniMax, or another provider; all provider-specific quota work stays inside 9Router.

## Implemented scope

This initial release implements milestones 0–3:

- API contract, provider matrix, compatibility, security documentation, and provider fixtures.
- Manifest V3 extension with a popup, options page, background service worker, typed local storage, and local URL validation.
- Health/version checks, dashboard-cookie authentication states, paginated sanitized connection discovery, and a login handoff.
- Concurrent quota fetching, provider-aware normalization, generic fallback behavior, cache persistence, and unit tests.

Not included yet: scheduled background refresh, notifications, badge alerts, remote/tunnel origins, content-script authentication fallback, or any write action against 9Router.

## Security model

The Chrome extension does **not** request or store:

- The 9Router dashboard password.
- Provider access tokens or refresh tokens.
- Provider API keys.
- The `auth_token` dashboard cookie.
- Raw connection records from the 9Router database.

Requests use the browser's existing 9Router dashboard session with `credentials: "include"`. If authentication is required, the popup opens the normal 9Router login page in a tab.

The extension never calls Claude, Codex, Gemini, Copilot, Kiro, GLM, MiniMax, or another provider directly.

## Requirements

- Node.js 22 or newer for development.
- Chrome or another Chromium browser with Manifest V3 support.
- A local 9Router instance at `http://localhost:20128` or `http://127.0.0.1:20128`.
- 9Router `0.5.40` or newer.

## Development

```bash
npm install
npm run check
```

Development server:

```bash
npm run dev
```

Production build:

```bash
npm run build
```

The unpacked extension is generated in `dist/`.

## Load the extension in Chrome

1. Run `npm install` and `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the generated `dist/` directory.
6. Open the extension settings and test the local 9Router connection.
7. If the popup reports `AUTH_REQUIRED`, open the 9Router login page, sign in, and refresh the popup.

## 9Router endpoints used

```text
GET /api/health
GET /api/version
GET /api/auth/status
GET /api/providers/client
GET /api/usage/{connectionId}
```

The extension does not use provider tokens and does not call `/api/providers/{id}` or any settings/update endpoint.

See [docs/api-contract.md](docs/api-contract.md) for the complete contract.

## Data normalization

9Router providers do not all expose quota in the same unit. The extension keeps the following fields separate:

```ts
{
  used: number | null;
  limit: number | null;
  remainingValue: number | null;
  remainingPercent: number | null;
  unit: "percent" | "requests" | "tokens" | "credits" | "usd" | "unknown";
  resetKind: "reset" | "expiry" | "none";
  syntheticScale: boolean;
}
```

This prevents absolute balances such as `348 credits` from being rendered as `348%`, and prevents Gemini/Antigravity's normalized `1000` scale from being presented as a real request limit.

## Project structure

```text
src/background/       Background message routing and refresh orchestration
src/core/client/      9Router API client and typed error model
src/core/quota/       Quota types, provider policies, normalization
src/core/refresh/     Concurrency-limited quota refresh pipeline
src/core/storage/     chrome.storage.local repository
src/options/          Settings and connection probe UI
src/popup/            Quota popup UI
src/shared/           URL and message contracts
tests/                Fixtures and unit tests
docs/                 Contract, compatibility, provider, and security notes
opencode-plugin/      OpenCode TUI sidebar, command, dialog, client, and tests
gnome-extension/      GNOME Shell top-panel indicator, preferences, client, and tests
```

## License

The Chrome extension and OpenCode plugin are MIT licensed. The GNOME Shell extension is GPL-3.0-or-later because GNOME Shell extensions must use a compatible license.
