# OpenCode 9Router Quota

A read-only OpenCode TUI plugin that displays quota for provider accounts already connected to a local 9Router instance.

The plugin uses OpenCode's supported TUI extension points:

- A persistent `sidebar_content` panel.
- A `/quota` command and command-palette entry.
- A larger quota dialog for all visible accounts.
- Per-account collapse/expand plus global expand-all and collapse-all controls.
- A scrollable dialog with mouse-wheel, scrollbar, arrow-key, `j`/`k`, and Page Up/Page Down navigation.

It does not read OpenCode provider credentials and does not call Claude, Codex, Gemini, Copilot, Kiro, GLM, MiniMax, or another upstream provider directly. Credential refresh and provider-specific quota requests remain inside 9Router.

## Requirements

- OpenCode `1.3.13` or newer.
- 9Router `0.5.40` or newer.
- A local 9Router instance, normally `http://127.0.0.1:20128`.

## Install from a local checkout

```bash
cd opencode-plugin
bun install
bun run check
opencode plugin "$PWD" -g
```

OpenCode reads the `./tui` export and writes the default options to its TUI plugin configuration.

## Authentication

The plugin never writes a dashboard password or session token to disk. Authentication material is read from the process environment and the resulting dashboard cookie stays in memory for the lifetime of the TUI process.

For password authentication:

```bash
export NINE_ROUTER_PASSWORD='your-dashboard-password'
opencode
```

The plugin logs in through `POST /api/auth/login`, captures only the returned `auth_token` cookie in memory, and retries the protected quota request once.

For an existing dashboard token, including an OIDC-created session:

```bash
export NINE_ROUTER_AUTH_COOKIE='auth_token=your-token'
opencode
```

A bare token value is also accepted. Dashboard JWTs expire, so password authentication is preferable when available.

When 9Router has `requireLogin=false`, neither variable is needed. Keep that mode limited to a loopback-only instance.

## Configuration

The plugin uses these defaults:

```json
{
  "baseUrl": "http://127.0.0.1:20128",
  "activeOnly": true,
  "refreshIntervalMs": 60000,
  "passwordEnv": "NINE_ROUTER_PASSWORD",
  "cookieEnv": "NINE_ROUTER_AUTH_COOKIE"
}
```

Additional supported options:

```json
{
  "timeoutMs": 15000,
  "concurrency": 4,
  "maxConnections": 10,
  "maxRowsPerConnection": 3,
  "allowRemote": false
}
```

`maxConnections` and `maxRowsPerConnection` keep the persistent sidebar compact. The `/quota` dialog ignores those display caps, loads all quota-enabled accounts returned by 9Router, and shows every quota row when an account is expanded.

Remote origins are rejected by default. Enabling `allowRemote` also requires an HTTPS URL.

## 9Router API contract

```text
GET  /api/health
GET  /api/version
POST /api/auth/login            # only when password authentication is needed
GET  /api/providers/client
GET  /api/usage/{connectionId}
```

The connection-list endpoint is sanitized by 9Router. The plugin does not request provider access tokens, refresh tokens, API keys, prompts, source code, or write-capable settings endpoints.

## Quota semantics

The display keeps absolute balances separate from percentages. This prevents values such as `348 credits` from becoming `348%`, and marks Gemini CLI/Antigravity's synthetic 1,000-point scale so it is never presented as a real request allowance.

One-shot CodeBuddy bonus packs are shown as expiring; recurring packages are shown as resetting.

## Commands and navigation

```text
/quota
```

The same action is available as **9Router quota** in the command palette.

Inside the dialog:

- Click `[+]` or `[-]` on an account header to expand or collapse that account.
- Use `[expand all]` and `[collapse all]` for all logged-in provider accounts.
- Scroll with the mouse wheel, drag the visible scrollbar, or use `↑`, `↓`, `j`, `k`, Page Up, and Page Down.
- Press `Esc` to close the dialog.

## Development

```bash
bun install
bun run typecheck
bun test
bun run build
```
