# Compatibility

## Baseline

The initial API and normalization contract targets 9Router `0.5.40` and newer.

The extension checks `/api/version` before loading protected data. Versions below `0.5.40` produce `INCOMPATIBLE_VERSION` rather than attempting an unknown schema.

## Required 9Router routes

```text
/api/health
/api/version
/api/providers/client
/api/usage/{connectionId}
```

`/api/auth/status` is supported for configuration inspection but is not required for the main refresh path.

## Supported browser scope

- Chrome/Chromium with Manifest V3 service workers.
- Local HTTP or HTTPS origins on `localhost` or `127.0.0.1`.

## Forward compatibility

Provider discovery is dynamic and quota parsing has a generic fallback. A newly added provider can display without an extension update when it returns a conventional `quotas` object.

An extension update is still warranted when a provider introduces:

- A new semantic for `remaining`.
- A nonstandard unit.
- A one-shot expiry versus recurring reset distinction.
- A synthetic normalization scale.
- A response without a `quotas` object.

## Known constraints

- The dashboard session cookie may behave differently under custom browser privacy policies. A same-origin content-script bridge is intentionally deferred until direct extension fetch has been tested across target environments.
- Remote 9Router origins are not permitted by the current manifest.
- Background alarms, notifications, and badge updates are outside milestones 0–3.
- Percentages inherited from 9Router may contain provider-specific assumptions, including the current Vercel monthly-credit denominator.
