/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { NineRouterClient } from "./client.js"
import { openQuotaDialog, QuotaView } from "./components.jsx"
import { parseConfig } from "./config.js"

const tui: TuiPlugin = async (api, options) => {
  if (options?.enabled === false) return

  const config = (() => {
    try {
      return parseConfig(options)
    } catch (error) {
      api.ui.toast({
        variant: "error",
        title: "9Router quota",
        message: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  })()
  if (!config) return

  const client = new NineRouterClient(config)

  api.keymap.registerLayer({
    commands: [
      {
        name: "nine-router.quota",
        title: "9Router quota",
        category: "Provider",
        namespace: "palette",
        slashName: "9router-quota",
        slashAliases: ["9r-quota"],
        run() {
          openQuotaDialog(api, client, config)
        },
      },
    ],
    bindings: [],
  })

  api.slots.register({
    order: 150,
    slots: {
      sidebar_content() {
        return (
          <QuotaView
            api={api}
            client={client}
            config={config}
            compact
            collapsible
            showCollapseActions={false}
            sectionCollapsible
            sectionStateKey="sidebar.section.collapsed"
            connectionStateKey="sidebar.connections.collapsed"
          />
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "opencode-9router-quota",
  tui,
}

export default plugin
