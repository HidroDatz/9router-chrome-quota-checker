# Troubleshooting local 9Router connectivity

Version 0.1.1 keeps structured diagnostics for every browser request instead of collapsing all `fetch()` failures into a generic offline message.

## Use the connection test

1. Build and reload the unpacked extension.
2. Open the extension options page.
3. Confirm the exact base URL, for example `http://127.0.0.1:20128`.
4. Select **Test connection**.
5. Expand **Technical details** when the test fails.

The diagnostic block includes:

- The failing stage: `health`, `version`, `provider-connections`, or `usage`.
- The exact HTTP method and request URL.
- HTTP status when Chrome received a response.
- Request elapsed time and timeout state.
- The JavaScript error name and message produced by `fetch()`.
- Whether Chrome currently grants the declared host permission.
- Browser online state, Chrome/Chromium major version, and user agent.
- Host permission patterns packaged in the loaded manifest.

## Interpret common results

### `Stage: health` and `Cause: TypeError: Failed to fetch`

9Router may still be reachable by `curl`; this result means the request failed inside the Chrome extension service worker. Check:

- The extension was loaded from the latest generated `dist/` directory.
- The extension details page grants site access to localhost/127.0.0.1.
- The configured hostname and scheme match the address that opens in Chrome.
- Chrome is current and is not controlled by a policy blocking local network requests.
- A proxy, VPN, antivirus, or browser profile policy is not intercepting the request.

Open `chrome://extensions`, select the extension's service worker inspector, and look for log entries prefixed with:

```text
[NineRouterClient]
[9Router Quota Checker]
```

Chrome DevTools may show a more specific network error such as `ERR_CONNECTION_REFUSED`, `ERR_BLOCKED_BY_CLIENT`, or a local-network policy failure even when the JavaScript exception only says `Failed to fetch`.

### `Chrome host permission: not granted`

Open **Manage extension → Site access** and allow access to the configured local origin. Reload the extension after changing access.

### `Stage: version`

The health endpoint succeeded, but `/api/version` failed or returned an unexpected payload. Verify that the configured instance is 9Router 0.5.40 or newer.

### `Stage: provider-connections` with HTTP 401

The local server and public endpoints are reachable, but the dashboard session is missing. Sign in using the same hostname shown in the request URL:

- `localhost` and `127.0.0.1` have separate cookies.
- Logging in at `http://localhost:20128` does not authenticate a request to `http://127.0.0.1:20128`.

### HTTP 403

9Router received the request and rejected it. Inspect dashboard authentication, tunnel access settings, reverse-proxy headers, and the 9Router server log.

## Verify the loaded build

After changing source code:

```bash
npm install
npm run check
npm run build
```

Then open `chrome://extensions` and click **Reload** for the unpacked extension. Confirm that the extension version is `0.1.1` and that it was loaded from `dist/`.
