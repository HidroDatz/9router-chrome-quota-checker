import "./options.css";
import type { ExtensionSettings, RouterProbeResult } from "../core/quota/types";
import { createTechnicalDetails } from "../shared/diagnostics";
import { assertSupportedBaseUrl } from "../shared/url";
import type {
  BackgroundRequest,
  BackgroundResponse,
  ExtensionState,
  SerializedError,
} from "../shared/messages";

const appNode = document.querySelector<HTMLElement>("#app");
if (!appNode) throw new Error("Options root element not found");
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

function setStatus(node: HTMLElement, message: string, kind: "normal" | "success" | "error"): void {
  node.className = `status${kind === "normal" ? "" : ` ${kind}`}`;
  node.replaceChildren(document.createTextNode(message));
  node.hidden = false;
}

function setErrorStatus(node: HTMLElement, error: SerializedError): void {
  setStatus(node, error.message, "error");
  node.append(createTechnicalDetails(error));
}

async function openLogin(): Promise<void> {
  const response = await send<string>({ type: "GET_LOGIN_URL" });
  if (response.ok) await chrome.tabs.create({ url: response.data });
}

async function initialize(): Promise<void> {
  const stateResponse = await send<ExtensionState>({ type: "GET_STATE" });
  const settings: ExtensionSettings = stateResponse.ok
    ? stateResponse.data.settings
    : { baseUrl: "http://localhost:20128", activeOnly: true };

  const page = el("div", "page");
  const hero = el("header", "hero");
  hero.append(el("h1", "", "9Router Quota Checker"), el("p", "", "Configure the local 9Router instance used by the read-only quota extension."));

  const panel = el("section", "panel");
  const form = document.createElement("form");
  const urlField = el("div", "field");
  const urlLabel = el("label", "", "9Router base URL");
  urlLabel.htmlFor = "base-url";
  const urlInput = document.createElement("input");
  urlInput.id = "base-url";
  urlInput.type = "url";
  urlInput.required = true;
  urlInput.autocomplete = "off";
  urlInput.spellcheck = false;
  urlInput.value = settings.baseUrl;
  urlField.append(urlLabel, urlInput, el("div", "help", "Milestones 0–3 support localhost and 127.0.0.1. The default address is http://localhost:20128."));

  const activeField = el("div", "field");
  const activeRow = el("label", "checkbox-row");
  const activeInput = document.createElement("input");
  activeInput.type = "checkbox";
  activeInput.checked = settings.activeOnly;
  const activeText = el("span");
  activeText.append(document.createTextNode("Only load active connections"), el("div", "help", "Disabled connections are not queried for quota."));
  activeRow.append(activeInput, activeText);
  activeField.append(activeRow);

  const status = el("div", "status");
  status.hidden = true;
  const actions = el("div", "actions");
  const saveButton = el("button", "primary", "Save settings");
  saveButton.type = "submit";
  const testButton = el("button", "", "Test connection");
  testButton.type = "button";
  const loginButton = el("button", "", "Open 9Router login");
  loginButton.type = "button";
  loginButton.addEventListener("click", () => void openLogin());
  actions.append(saveButton, testButton, loginButton);

  form.append(urlField, activeField, actions, status);
  panel.append(form, el("div", "security-note", "The extension never asks for or stores your 9Router password, provider OAuth tokens, refresh tokens, or API keys. Authentication remains in the 9Router dashboard cookie."));
  page.append(hero, panel);
  app.append(page);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      saveButton.disabled = true;
      try {
        const baseUrl = assertSupportedBaseUrl(urlInput.value);
        const response = await send<ExtensionSettings>({ type: "SAVE_SETTINGS", settings: { baseUrl, activeOnly: activeInput.checked } });
        if (!response.ok) {
          setErrorStatus(status, response.error);
          return;
        }
        urlInput.value = response.data.baseUrl;
        setStatus(status, "Settings saved. The quota cache was cleared if the URL changed.", "success");
      } catch (error) {
        setStatus(status, error instanceof Error ? error.message : "Unable to save settings.", "error");
      } finally {
        saveButton.disabled = false;
      }
    })();
  });

  testButton.addEventListener("click", () => {
    void (async () => {
      testButton.disabled = true;
      setStatus(status, "Checking 9Router…", "normal");
      try {
        const baseUrl = assertSupportedBaseUrl(urlInput.value);
        const saved = await send<ExtensionSettings>({ type: "SAVE_SETTINGS", settings: { baseUrl, activeOnly: activeInput.checked } });
        if (!saved.ok) {
          setErrorStatus(status, saved.error);
          return;
        }
        const response = await send<RouterProbeResult>({ type: "PROBE_ROUTER" });
        if (!response.ok) {
          setErrorStatus(status, response.error);
          return;
        }
        setStatus(status, `Connected to 9Router ${response.data.version.currentVersion}. Found ${response.data.connectionCount} eligible connection(s).`, "success");
      } catch (error) {
        setStatus(status, error instanceof Error ? error.message : "Connection test failed.", "error");
      } finally {
        testButton.disabled = false;
      }
    })();
  });
}

void initialize();
