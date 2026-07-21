# 9Router API contract

This document records the read-only interface used by the extension. The baseline was derived from 9Router `0.5.40`.

## Base URL

The milestones 0–3 build permits only:

```text
http://localhost:<port>
https://localhost:<port>
http://127.0.0.1:<port>
https://127.0.0.1:<port>
```

The default is `http://localhost:20128`.

Every request uses:

```ts
{
  credentials: "include",
  cache: "no-store",
  headers: { Accept: "application/json" }
}
```

The extension never reads the dashboard cookie itself.

## `GET /api/health`

Public endpoint used to detect whether 9Router is reachable.

Expected response:

```json
{ "ok": true }
```

Unexpected JSON is treated as `INVALID_RESPONSE`. A network failure or timeout is treated as `OFFLINE`.

## `GET /api/version`

Public endpoint used to enforce the compatibility floor.

Expected response:

```json
{
  "currentVersion": "0.5.40",
  "latestVersion": "0.5.40",
  "hasUpdate": false
}
```

`currentVersion` must be at least `0.5.40`.

## `GET /api/auth/status`

Public configuration endpoint. It describes the dashboard authentication mode but does not prove that the extension has a valid authenticated session.

Example:

```json
{
  "requireLogin": true,
  "authMode": "password",
  "oidcConfigured": false,
  "displayName": "Password user",
  "loginMethod": "Password"
}
```

The authoritative authentication probe is a request to a protected endpoint such as `/api/providers/client`.

## `GET /api/providers/client`

Protected endpoint that returns sanitized usage-eligible connections.

Query parameters used by the extension:

```text
accountStatus=active|all
sort=priority
page=<positive integer>
pageSize=100
```

Example response:

```json
{
  "connections": [
    {
      "id": "connection-id",
      "provider": "claude",
      "authType": "oauth",
      "email": "user@example.com",
      "isActive": true
    }
  ],
  "providerOptions": ["claude"],
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "total": 1,
    "totalPages": 1
  }
}
```

The route intentionally omits provider credentials. The extension rejects entries without string `id` and `provider` fields and follows pagination until `totalPages` is exhausted.

## `GET /api/usage/{connectionId}`

Protected endpoint that refreshes OAuth credentials when necessary, applies the connection proxy, dispatches to the provider usage handler, and returns provider-specific usage data.

Common successful shape:

```json
{
  "plan": "Claude Code",
  "quotas": {
    "session (5h)": {
      "used": 42,
      "total": 100,
      "remaining": 58,
      "remainingPercentage": 58,
      "resetAt": "2026-07-21T20:00:00.000Z",
      "unlimited": false
    }
  }
}
```

Informational providers may return only:

```json
{
  "message": "Usage tracked per request."
}
```

A message with no quota rows is not automatically an error. Authentication-like messages are represented as `auth-required`; other messages are represented as `info`.

## Error mapping

| Condition | Extension code |
|---|---|
| Fetch failure or timeout | `OFFLINE` |
| HTTP 401 | `AUTH_REQUIRED` |
| HTTP 403 | `FORBIDDEN` |
| 9Router below minimum version | `INCOMPATIBLE_VERSION` |
| Other non-2xx response | `HTTP_ERROR` |
| Invalid/non-JSON response | `INVALID_RESPONSE` |

A failure fetching the connection list stops the top-level refresh. A failure fetching one connection's quota creates an error snapshot for that connection and does not cancel the remaining queue.

## Cache schema

```ts
interface QuotaCache {
  schemaVersion: 1;
  baseUrl: string;
  routerVersion: string | null;
  fetchedAt: string;
  connections: ConnectionQuotaSnapshot[];
}
```

Only normalized fields are stored in `chrome.storage.local`; raw provider responses are not persisted.
