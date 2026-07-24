# 9Router GNOME Quota Indicator

A read-only GNOME Shell extension that shows quota for provider accounts connected to 9Router in the top panel.

## Features

- Native GNOME top-panel indicator (`9R 42%`) based on the lowest remaining numeric quota.
- Collapsible provider and account submenus.
- Provider plan, quota bucket, remaining value, reset time, and informational messages.
- Manual and periodic refresh with bounded concurrency.
- Low-quota notifications deduplicated per reset cycle.
- Password or dashboard-cookie authentication stored in GNOME Keyring.
- Localhost-only by default; remote instances require HTTPS and explicit opt-in.
- No direct calls to Claude, Codex, Gemini, Copilot, GLM, MiniMax, or other upstream providers.

## Requirements

- GNOME Shell 45–50.
- 9Router 0.5.40 or newer.
- `libsecret` / a Secret Service implementation for password or cookie authentication.
- `gnome-extensions` and `glib-compile-schemas` for packaging or manual installation.

## Development checks

```bash
cd gnome-extension
npm run check
```

The tests exercise the provider-aware quota normalizer. The validation script parses metadata, checks all JavaScript syntax, verifies supported shell versions, and ensures secrets are not stored in GSettings.

## Package

```bash
cd gnome-extension
npm run package
```

The resulting ZIP is written to `gnome-extension/dist/` using `gnome-extensions pack`.

## Install a development build

```bash
cd gnome-extension
npm run package
gnome-extensions install --force dist/nine-router-quota@hidrodatz.github.io.shell-extension.zip
```

Log out and back in, then enable it:

```bash
gnome-extensions enable nine-router-quota@hidrodatz.github.io
```

Open preferences:

```bash
gnome-extensions prefs nine-router-quota@hidrodatz.github.io
```

## Authentication

Three modes are available:

- **No authentication**: for a loopback-only 9Router instance with `requireLogin=false`.
- **Dashboard password**: the extension logs in through `POST /api/auth/login`; the password stays in GNOME Keyring and the returned session cookie stays in memory.
- **Dashboard auth cookie**: useful for an existing dashboard or OIDC session; the cookie stays in GNOME Keyring and may need replacement when it expires.

The extension never stores provider API keys, OAuth access tokens, refresh tokens, prompts, source code, or raw 9Router database records.

## 9Router API contract

```text
GET  /api/health
GET  /api/version
POST /api/auth/login
GET  /api/providers/client
GET  /api/usage/{connectionId}
```

The extension queries sanitized connections, then delegates credential refresh and provider-specific quota requests to 9Router.

## Troubleshooting

View GNOME Shell logs:

```bash
journalctl --user -f -o cat /usr/bin/gnome-shell
```

Check extension state:

```bash
gnome-extensions info nine-router-quota@hidrodatz.github.io
```

If the panel displays `9R !`, open the menu for a concise error. Common causes are an offline 9Router process, missing authentication, an expired dashboard cookie, a remote HTTP URL, or a 9Router version below 0.5.40.

## License

GPL-3.0-or-later. GNOME Shell extensions must use a license compatible with GNOME Shell.
