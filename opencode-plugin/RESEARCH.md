# OpenCode quota integration research

Research baseline: `anomalyco/opencode` `dev` at commit `cb562b2c6289c2eee707078f9ab644cbe1d3d8a9` (2026-07-21).

## Why this is an external TUI plugin

OpenCode already exposes the capabilities required for a quota client through `@opencode-ai/plugin/tui`:

- `api.slots.register()` with `sidebar_content`.
- `api.keymap.registerLayer()` with slash-command metadata.
- `api.ui.dialog` for a detailed view.
- Package-level `./tui` exports and install-time default configuration.

A working ecosystem of provider-specific quota plugins already uses these extension points. Adding provider APIs, token refresh, caching, routes, and TUI state directly to OpenCode would duplicate active upstream work and couple core to private or unstable provider endpoints.

## Related upstream work

- Issue `anomalyco/opencode#9281` requests unified usage tracking.
- PR `anomalyco/opencode#9545` implements a broad native usage service, provider fetchers, server routes, and TUI views; it remains open.
- Issue `anomalyco/opencode#18969` discusses plugin-provided persistent status UI.

This implementation deliberately avoids overlapping with the native usage PR. It treats 9Router as the quota aggregation boundary and uses only public OpenCode TUI extension points.

## Security boundary

OpenCode receives only normalized quota data. 9Router retains responsibility for:

- OAuth and API-key storage.
- Credential refresh.
- Provider proxy settings.
- Provider-specific quota endpoints.

The TUI plugin stores no credential on disk. Passwords and optional dashboard cookies are environment-only; the session cookie is kept in process memory.

## Future upstream proposal

A generic, mergeable core addition would be a provider-usage plugin contract rather than built-in fetchers. Such a contract should be discussed in an issue before implementation, in accordance with OpenCode's design-review and issue-first contribution policy. The external plugin provides a working reference implementation without blocking on that design decision.
