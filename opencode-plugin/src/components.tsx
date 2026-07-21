/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { NineRouterClient, NineRouterError } from "./client.js"
import { absoluteText, connectionName, progressBar, remainingText, resetText } from "./format.js"
import type { ConnectionQuotaSnapshot, PluginConfig, QuotaBucket, RouterSnapshot } from "./types.js"

function quotaColor(theme: TuiThemeCurrent, bucket: QuotaBucket) {
  const remaining = bucket.remainingPercent
  if (remaining === null) return theme.textMuted
  if (remaining < 10) return theme.error
  if (remaining < 30) return theme.warning
  return theme.success
}

function errorMessage(error: unknown, config: PluginConfig) {
  if (!(error instanceof NineRouterError)) return error instanceof Error ? error.message : String(error)
  if (error.code === "AUTH_REQUIRED") {
    return `Authentication required. Set ${config.passwordEnv} or ${config.cookieEnv}.`
  }
  return error.message
}

function BucketRow(props: { bucket: QuotaBucket; theme: TuiThemeCurrent; compact: boolean }) {
  const detail = createMemo(() => [absoluteText(props.bucket), resetText(props.bucket)].filter(Boolean).join(" · "))

  return (
    <box width="100%" flexDirection="column">
      <box width="100%" flexDirection="row" justifyContent="space-between">
        <text fg={props.theme.text}>{props.bucket.label}</text>
        <text fg={quotaColor(props.theme, props.bucket)}>{remainingText(props.bucket)}</text>
      </box>
      <Show when={props.bucket.remainingPercent !== null}>
        <text fg={quotaColor(props.theme, props.bucket)}>{progressBar(props.bucket, props.compact ? 12 : 20)}</text>
      </Show>
      <Show when={detail()}>{(value: () => string) => <text fg={props.theme.textMuted}>{value()}</text>}</Show>
    </box>
  )
}

function ConnectionBlock(props: {
  connection: ConnectionQuotaSnapshot
  theme: TuiThemeCurrent
  compact: boolean
  rows: number
}) {
  const buckets = createMemo(() => props.connection.buckets.slice(0, props.rows))

  return (
    <box width="100%" flexDirection="column" marginBottom={1}>
      <box width="100%" flexDirection="row" justifyContent="space-between">
        <text fg={props.theme.text}>
          <b>{connectionName(props.connection)}</b>
        </text>
        <Show when={props.connection.plan}>{(plan: () => string) => <text fg={props.theme.textMuted}>{plan()}</text>}</Show>
      </box>
      <Show when={props.connection.message && props.connection.buckets.length === 0}>
        <text fg={props.connection.status === "error" ? props.theme.error : props.theme.textMuted}>
          {props.connection.message}
        </text>
      </Show>
      <For each={buckets()}>{(bucket: QuotaBucket) => <BucketRow bucket={bucket} theme={props.theme} compact={props.compact} />}</For>
      <Show when={props.connection.buckets.length > props.rows}>
        <text fg={props.theme.textMuted}>+{props.connection.buckets.length - props.rows} more quota rows</text>
      </Show>
    </box>
  )
}

export function QuotaView(props: {
  api: TuiPluginApi
  client: NineRouterClient
  config: PluginConfig
  compact?: boolean
  polling?: boolean
}) {
  const compact = props.compact === true
  const [snapshot, setSnapshot] = createSignal<RouterSnapshot | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal("")
  let running = false

  const refresh = async () => {
    if (running) return
    running = true
    setLoading(true)
    await props.client
      .snapshot()
      .then((value) => {
        setSnapshot(value)
        setError("")
      })
      .catch((reason: unknown) => setError(errorMessage(reason, props.config)))
      .finally(() => {
        running = false
        setLoading(false)
      })
  }

  onMount(() => {
    void refresh()
    if (props.polling === false) return
    const timer = setInterval(() => void refresh(), props.config.refreshIntervalMs)
    onCleanup(() => clearInterval(timer))
  })

  const connections = createMemo(() => snapshot()?.connections.slice(0, props.config.maxConnections) ?? [])
  const low = createMemo(
    () =>
      snapshot()?.connections.filter((connection) =>
        connection.buckets.some((bucket) => bucket.remainingPercent !== null && bucket.remainingPercent < 20),
      ).length ?? 0,
  )

  return (
    <box width="100%" flexDirection="column">
      <box width="100%" flexDirection="row" justifyContent="space-between">
        <text fg={props.api.theme.current.accent}>
          <b>9ROUTER QUOTA</b>
        </text>
        <Show when={loading()}>
          <text fg={props.api.theme.current.textMuted}>...</text>
        </Show>
      </box>

      <Show when={error()}>{(value: () => string) => <text fg={props.api.theme.current.error}>{value()}</text>}</Show>
      <Show when={!error() && !loading() && connections().length === 0}>
        <text fg={props.api.theme.current.textMuted}>No quota-enabled connections</text>
      </Show>

      <For each={connections()}>
        {(connection: ConnectionQuotaSnapshot) => (
          <ConnectionBlock
            connection={connection}
            theme={props.api.theme.current}
            compact={compact}
            rows={props.config.maxRowsPerConnection}
          />
        )}
      </For>

      <Show when={snapshot()}>
        {(value: () => RouterSnapshot) => (
          <box width="100%" flexDirection="row" justifyContent="space-between">
            <text fg={props.api.theme.current.textMuted}>
              {value().connections.length} accounts · {low()} low
            </text>
            <text fg={props.api.theme.current.textMuted}>9Router {value().routerVersion || "unknown"}</text>
          </box>
        )}
      </Show>
    </box>
  )
}

export function openQuotaDialog(api: TuiPluginApi, client: NineRouterClient, config: PluginConfig) {
  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => (
    <box paddingBottom={1} paddingLeft={2} paddingRight={2} gap={1} flexDirection="column">
      <QuotaView api={api} client={client} config={config} compact={false} />
      <text fg={api.theme.current.textMuted}>Esc closes · refresh interval {Math.round(config.refreshIntervalMs / 1000)}s</text>
    </box>
  ))
}
