# Security and privacy

## Trust boundary

9Router remains the credential holder and provider client. The extension is a read-only dashboard client.

```text
Provider credential
      ↓
9Router local database and server-side handler
      ↓
Sanitized connection metadata + quota response
      ↓
Chrome extension normalized cache
```

## Data the extension does not collect

- Dashboard passwords.
- OAuth access or refresh tokens.
- Provider API keys.
- Browser-session cookies.
- Prompt or completion content.
- Source code sent through 9Router.
- Raw database files.

## Chrome permissions

Milestones 0–3 request only:

```json
{
  "permissions": ["storage"],
  "host_permissions": [
    "http://localhost/*",
    "https://localhost/*",
    "http://127.0.0.1/*",
    "https://127.0.0.1/*"
  ]
}
```

The extension does not request `cookies`, `tabs`, `scripting`, `webRequest`, `activeTab`, or notification permissions. Opening a login tab does not require reading tab contents.

## Authentication

Protected 9Router endpoints use the dashboard session cookie. Fetch requests set `credentials: "include"`, but JavaScript never reads the HttpOnly cookie.

When the API returns HTTP 401, the extension presents a link to the normal 9Router login page. It never renders a password form.

## Storage

`chrome.storage.local` contains only:

- The local 9Router base URL.
- The active-only preference.
- Normalized quota snapshots.
- Non-secret account labels returned by the sanitized client endpoint.

Raw usage payloads are not persisted.

## Rendering

Provider names, account labels, plans, quota names, and provider messages are inserted using `textContent`. They are never interpolated into HTML.

## Network scope

The initial release restricts configuration to `localhost` and `127.0.0.1`. Remote origins, tunnels, and Tailscale hosts require a later permission and threat-model review.

## Read-only guarantee

The extension calls only GET endpoints. It does not:

- Add, update, disable, or delete provider connections.
- Change 9Router settings.
- Trigger Claude/Codex auto-ping.
- Consume Codex reset credits.
- Send model requests.
