import "./popup.css";
import type { ConnectionQuotaSnapshot, QuotaBucket, QuotaCache } from "../core/quota/types";
import { createTechnicalDetails } from "../shared/diagnostics";
import type {
  BackgroundRequest,
  BackgroundResponse,
  ExtensionState,
  SerializedError,
} from "../shared/messages";

const appNode = document.querySelector<HTMLElement>("#app");
if (!appNode) throw new Error("Popup root element not found");
const app: HTMLElement = appNode;

function send<T>(request: BackgroundRequest): Promise<BackgroundResponse<T>> {
  return chrome.runtime.sendMessage(request) as Promise<BackgroundResponse<T>>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function providerName(provider: string): string {
  const names: Record<string, string> = {
    github: "GitHub Copilot", "gemini-cli": "Gemini CLI", antigravity: "Antigravity",
    claude: "Claude Code", codex: "OpenAI Codex", kiro: "Kiro", qoder: "Qoder",
    qwen: "Qwen", iflow: "iFlow", ollama: "Ollama Cloud", glm: "GLM",
    "glm-cn": "GLM CN", minimax: "MiniMax", "minimax-cn": "MiniMax CN",
    "vercel-ai-gateway": "Vercel AI Gateway", "codebuddy-cn": "CodeBuddy CN", "grok-cli": "Grok CLI",
  };
  return names[provider] ?? provider;
}

function tone(percent: number | null): "good" | "medium" | "low" | "" {
  if (percent === null) return "";
  if (percent > 70) return "good";
  if (percent >= 30) return "medium";
  return "low";
}

function countdown(bucket: QuotaBucket): string {
  if (!bucket.resetAt || bucket.resetKind === "none") return "No reset time";
  const diff = new Date(bucket.resetAt).getTime() - Date.now();
  const prefix = bucket.resetKind === "expiry" ? "Expires" : "Resets";
  if (!Number.isFinite(diff)) return "Unknown reset time";
  if (diff <= 0) return `${prefix} now`;
  const minutes = Math.ceil(diff / 60_000);
  if (minutes < 60) return `${prefix} in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${prefix} in ${hours}h ${minutes % 60}m`;
  return `${prefix} in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function amount(bucket: QuotaBucket): string {
  if (bucket.unlimited) return "Unlimited";
  if (bucket.syntheticScale || bucket.unit === "percent") return "Provider percentage";
  if (bucket.remainingValue !== null) {
    if (bucket.unit === "usd") return `$${bucket.remainingValue.toFixed(2)} remaining`;
    const unit = bucket.unit === "unknown" ? "" : ` ${bucket.unit}`;
    return `${bucket.remainingValue.toLocaleString()}${unit} remaining`;
  }
  if (bucket.used !== null && bucket.limit !== null && bucket.limit > 0) {
    return `${bucket.used.toLocaleString()} / ${bucket.limit.toLocaleString()}`;
  }
  return "Usage value unavailable";
}

function bucketNode(bucket: QuotaBucket): HTMLElement {
  const root = el("div", "bucket");
  const row = el("div", "row");
  row.append(el("span", "name", bucket.label), el("span", "percent", bucket.remainingPercent === null ? "—" : `${Math.round(bucket.remainingPercent)}%`));
  root.append(row);
  if (bucket.remainingPercent !== null) {
    const track = el("div", "track");
    const fill = el("div", `fill ${tone(bucket.remainingPercent)}`);
    fill.style.width = `${Math.max(0, Math.min(100, bucket.remainingPercent))}%`;
    track.append(fill);
    root.append(track);
  }
  const meta = el("div", "meta");
  meta.append(el("span", "", amount(bucket)), el("span", "", countdown(bucket)));
  root.append(meta);
  return root;
}

function minimum(snapshot: ConnectionQuotaSnapshot): number | null {
  const values = snapshot.buckets.map((bucket) => bucket.remainingPercent).filter((value): value is number => value !== null);
  return values.length ? Math.min(...values) : null;
}

function card(snapshot: ConnectionQuotaSnapshot): HTMLElement {
  const root = el("article", "card");
  const head = el("div", "card-head");
  const labels = el("div");
  labels.append(el("h2", "provider", providerName(snapshot.provider)), el("div", "account", [snapshot.accountLabel, snapshot.plan].filter(Boolean).join(" · ") || snapshot.connectionId));
  head.append(labels, el("span", `dot ${tone(minimum(snapshot))}`));
  root.append(head);
  for (const bucket of snapshot.buckets) root.append(bucketNode(bucket));
  if (snapshot.message) root.append(el("p", "message", snapshot.message));
  return root;
}

function cacheNode(cache: QuotaCache): HTMLElement {
  const root = el("div");
  const sorted = [...cache.connections].sort((a, b) => (minimum(a) ?? Infinity) - (minimum(b) ?? Infinity) || providerName(a.provider).localeCompare(providerName(b.provider)));
  const low = sorted.filter((item) => (minimum(item) ?? 100) < 30).length;
  const errors = sorted.filter((item) => ["auth-required", "offline", "error"].includes(item.status)).length;
  const summary = el("div", "summary");
  for (const [value, label] of [[sorted.length, "Connections"], [low, "Low quota"], [errors, "Needs attention"]] as const) {
    const item = el("div", "summary-item");
    item.append(el("span", "summary-value", String(value)), el("span", "summary-label", label));
    summary.append(item);
  }
  root.append(summary);
  if (!sorted.length) return el("div", "empty", "No eligible 9Router connections were found.");
  const list = el("section", "list");
  for (const snapshot of sorted) list.append(card(snapshot));
  root.append(list);
  return root;
}

let state: ExtensionState | null = null;
let busy = false;
let currentError: SerializedError | null = null;

async function openLogin(): Promise<void> {
  const response = await send<string>({ type: "GET_LOGIN_URL" });
  if (response.ok) await chrome.tabs.create({ url: response.data });
}

function render(): void {
  app.replaceChildren();
  const shell = el("div", "shell");
  const header = el("header", "header");
  const title = el("div");
  title.append(el("h1", "title", "9Router Quota"), el("p", "subtitle", state?.cache?.routerVersion ? `Local router · v${state.cache.routerVersion}` : "Local router quota monitor"));
  const actions = el("div", "actions");
  const settingsButton = el("button", "button", "Settings");
  settingsButton.addEventListener("click", () => void chrome.runtime.openOptionsPage());
  const refreshButton = el("button", "button primary", busy ? "Refreshing…" : "Refresh");
  refreshButton.disabled = busy;
  refreshButton.addEventListener("click", () => void refresh());
  actions.append(settingsButton, refreshButton);
  header.append(title, actions);
  shell.append(header);

  if (currentError) {
    const banner = el("div", `banner ${currentError.code === "AUTH_REQUIRED" ? "warning" : ""}`);
    const row = el("div", "banner-row");
    row.append(el("span", "", currentError.message));
    if (currentError.code === "AUTH_REQUIRED") {
      const login = el("button", "button primary", "Open login");
      login.addEventListener("click", () => void openLogin());
      row.append(login);
    }
    banner.append(row, createTechnicalDetails(currentError));
    shell.append(banner);
  }

  if (state?.cache) shell.append(cacheNode(state.cache));
  else if (!currentError) shell.append(el("div", "empty", busy ? "Loading quota…" : "No cached quota yet."));

  const footer = el("footer", "footer");
  footer.append(el("span", "", state?.settings.baseUrl ?? ""), el("span", "", state?.cache ? `Updated ${new Date(state.cache.fetchedAt).toLocaleTimeString()}` : "Read-only"));
  shell.append(footer);
  app.append(shell);
}

async function refresh(): Promise<void> {
  if (busy) return;
  busy = true;
  currentError = null;
  render();
  const response = await send<QuotaCache>({ type: "REFRESH_QUOTAS" });
  busy = false;
  if (response.ok) {
    state = state ? { ...state, cache: response.data } : { settings: { baseUrl: response.data.baseUrl, activeOnly: true }, cache: response.data };
  } else {
    currentError = response.error;
  }
  render();
}

async function initialize(): Promise<void> {
  busy = true;
  render();
  const response = await send<ExtensionState>({ type: "GET_STATE" });
  if (response.ok) state = response.data;
  else currentError = response.error;
  busy = false;
  render();
  await refresh();
}

void initialize();
