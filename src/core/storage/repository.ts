import type { ExtensionSettings, QuotaCache } from "../quota/types";
import { assertSupportedBaseUrl, DEFAULT_BASE_URL } from "../../shared/url";

const SETTINGS_KEY = "settings";
const QUOTA_CACHE_KEY = "quotaCache";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  baseUrl: DEFAULT_BASE_URL,
  activeOnly: true,
};

function storageAvailable(): boolean {
  return typeof chrome !== "undefined" && chrome.storage?.local !== undefined;
}

export async function getSettings(): Promise<ExtensionSettings> {
  if (!storageAvailable()) return DEFAULT_SETTINGS;
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const value = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;

  let baseUrl = DEFAULT_SETTINGS.baseUrl;
  try {
    if (typeof value?.baseUrl === "string") {
      baseUrl = assertSupportedBaseUrl(value.baseUrl);
    }
  } catch {
    baseUrl = DEFAULT_SETTINGS.baseUrl;
  }

  return {
    baseUrl,
    activeOnly: typeof value?.activeOnly === "boolean" ? value.activeOnly : true,
  };
}

export async function saveSettings(
  updates: Partial<ExtensionSettings>,
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const next: ExtensionSettings = {
    baseUrl:
      typeof updates.baseUrl === "string"
        ? assertSupportedBaseUrl(updates.baseUrl)
        : current.baseUrl,
    activeOnly:
      typeof updates.activeOnly === "boolean" ? updates.activeOnly : current.activeOnly,
  };

  if (storageAvailable()) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  }
  return next;
}

export async function getQuotaCache(): Promise<QuotaCache | null> {
  if (!storageAvailable()) return null;
  const result = await chrome.storage.local.get(QUOTA_CACHE_KEY);
  const cache = result[QUOTA_CACHE_KEY] as QuotaCache | undefined;
  return cache?.schemaVersion === 1 ? cache : null;
}

export async function saveQuotaCache(cache: QuotaCache): Promise<void> {
  if (!storageAvailable()) return;
  await chrome.storage.local.set({ [QUOTA_CACHE_KEY]: cache });
}

export async function clearQuotaCache(): Promise<void> {
  if (!storageAvailable()) return;
  await chrome.storage.local.remove(QUOTA_CACHE_KEY);
}

export async function initializeStorage(): Promise<void> {
  const settings = await getSettings();
  if (storageAvailable()) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  }
}
