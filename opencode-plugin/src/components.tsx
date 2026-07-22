/** @jsxImportSource @opentui/solid */
import type { ScrollBoxRenderable } from "@opentui/core"
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { NineRouterClient, NineRouterError } from "./client.js"
import { absoluteText, connectionName, connectionSummary, progressBar, remainingText, resetText } from "./format.js"
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
  collapsed: boolean
  showAllRows: boolean
  onToggle?: () => void
}) {
  const toggleable = createMemo(() => Boolean(props.onToggle && props.connection.buckets.length > 0))
  const buckets = createMemo(() => {
    if (props.collapsed) return []
    if (props.showAllRows) return props.connection.buckets
    return props.connection.buckets.slice(0, props.rows)
  })
  const hidden = createMemo(() => (props.showAllRows ? 0 : Math.max(0, props.connection.buckets.length - props.rows)))

  return (
    <box width="100%" flexDirection="column" marginBottom={1}>
      <box
        width="100%"
        flexDirection="row"
        justifyContent="space-between"
        onMouseUp={() => {
          if (toggleable()) props.onToggle?.()
        }}
      >
        <box flexDirection="row" minWidth={0} flexShrink={1}>
          <Show when={toggleable()}>
            <text fg={props.theme.accent}>{props.collapsed ? "[+] " : "[-] "}</text>
          </Show>
          <text fg={props.theme.text}>
            <b>{connectionName(props.connection)}</b>
          </text>
        </box>
        <Show when={props.connection.plan}>{(plan: () => string) => <text fg={props.theme.textMuted}>{plan()}</text>}</Show>
      </box>

      <Show when={props.connection.message && props.connection.buckets.length === 0}>
        <text fg={props.connection.status === "error" ? props.theme.error : props.theme.textMuted}>
          {props.connection.message}
        </text>
      </Show>

      <Show when={props.collapsed && toggleable()}>
        <text fg={props.theme.textMuted}>{connectionSummary(props.connection)} · click to expand</text>
      </Show>

      <Show when={!props.collapsed}>
        <For each={buckets()}>{(bucket: QuotaBucket) => <BucketRow bucket={bucket} theme={props.theme} compact={props.compact} />}</For>
        <Show when={hidden() > 0}>
          <text fg={props.theme.textMuted}>+{hidden()} more quota rows</text>
        </Show>
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
  collapsible?: boolean
  scrollable?: boolean
  showAllConnections?: boolean
  showAllRows?: boolean
}) {
  const compact = props.compact === true
  const collapsible = props.collapsible === true
  const dimensions = useTerminalDimensions()
  const [snapshot, setSnapshot] = createSignal<RouterSnapshot | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal("")
  const [collapsed, setCollapsed] = createSignal<ReadonlySet<string>>(new Set())
  let running = false
  let scroll: ScrollBoxRenderable | undefined

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

  useKeyboard((event) => {
    if (props.scrollable !== true || !scroll) return
    const page = Math.max(1, scroll.height - 2)
    const amount =
      event.name === "up" || event.name === "k"
        ? -1
        : event.name === "down" || event.name === "j"
          ? 1
          : event.name === "pageup" || event.name === "page_up"
            ? -page
            : event.name === "pagedown" || event.name === "page_down"
              ? page
              : 0
    if (amount === 0) return
    event.preventDefault()
    event.stopPropagation()
    scroll.scrollBy(amount)
  })

  const connections = createMemo(() => {
    const rows = snapshot()?.connections ?? []
    if (props.showAllConnections === true) return rows
    return rows.slice(0, props.config.maxConnections)
  })
  const scrollHeight = createMemo(() => Math.max(8, Math.min(36, Math.floor(dimensions().height * 0.65))))
  const low = createMemo(
    () =>
      snapshot()?.connections.filter((connection) =>
        connection.buckets.some((bucket) => bucket.remainingPercent !== null && bucket.remainingPercent < 20),
      ).length ?? 0,
  )

  const toggleConnection = (connectionId: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(connectionId)) next.delete(connectionId)
      else next.add(connectionId)
      return next
    })
  }

  const expandAll = () => setCollapsed(new Set())
  const collapseAll = () =>
    setCollapsed(new Set(connections().filter((connection) => connection.buckets.length > 0).map((connection) => connection.connectionId)))

  const ConnectionList = () => (
    <>
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
            collapsed={collapsible && collapsed().has(connection.connectionId)}
            showAllRows={props.showAllRows === true}
            onToggle={collapsible && connection.buckets.length > 0 ? () => toggleConnection(connection.connectionId) : undefined}
          />
        )}
      </For>
    </>
  )

  return (
    <box width="100%" flexDirection="column" flexGrow={props.scrollable === true ? 1 : undefined}>
      <box width="100%" flexDirection="row" justifyContent="space-between">
        <text fg={props.api.theme.current.accent}>
          <b>9ROUTER QUOTA</b>
        </text>
        <Show when={loading()}>
          <text fg={props.api.theme.current.textMuted}>...</text>
        </Show>
      </box>

      <Show when={collapsible && connections().some((connection) => connection.buckets.length > 0)}>
        <box width="100%" flexDirection="row" gap={2}>
          <text fg={props.api.theme.current.primary} onMouseUp={() => expandAll()}>
            [expand all]
          </text>
          <text fg={props.api.theme.current.textMuted} onMouseUp={() => collapseAll()}>
            [collapse all]
          </text>
        </box>
      </Show>

      <Show when={props.scrollable === true} fallback={<ConnectionList />}>
        <scrollbox
          maxHeight={scrollHeight()}
          paddingRight={1}
          scrollbarOptions={{ visible: true }}
          ref={(value: ScrollBoxRenderable) => (scroll = value)}
        >
          <ConnectionList />
        </scrollbox>
      </Show>

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
    <box paddingBottom={1} paddingLeft={2} paddingRight={2} gap={1} flexDirection="column" flexGrow={1}>
      <QuotaView
        api={api}
        client={client}
        config={config}
        compact={false}
        collapsible
        scrollable
        showAllConnections
        showAllRows
      />
      <text fg={api.theme.current.textMuted} wrapMode="word">
        Click an account or use expand/collapse all · mouse wheel, ↑/↓, j/k, PgUp/PgDn scroll · Esc closes
      </text>
    </box>
  ))
}
