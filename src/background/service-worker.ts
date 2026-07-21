import {
  asRouterClientError,
  type RouterClientErrorDetails,
} from "../core/client/errors";
import { NineRouterClient } from "../core/client/nineRouterClient";
import type { RouterProbeResult } from "../core/quota/types";
import { refreshAllQuotas } from "../core/refresh/refreshAll";
import {
  clearQuotaCache,
  getQuotaCache,
  getSettings,
  initializeStorage,
  saveQuotaCache,
  saveSettings,
} from "../core/storage/repository";
import type {
  BackgroundRequest,
  BackgroundResponse,
  ExtensionState,
  SerializedError,
} from "../shared/messages";

function success<T>(data: T): BackgroundResponse<T> {
  return { ok: true, data };
}

function permissionPatternForUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

async function failure(error: unknown): Promise<BackgroundResponse<never>> {
  const normalized = asRouterClientError(error);
  const manifest = chrome.runtime.getManifest();
  const declaredHostPermissions = manifest.host_permissions ?? [];
  const details: RouterClientErrorDetails = normalized.details
    ? {
        ...normalized.details,
        declaredHostPermissions,
        extensionVersion: manifest.version,
      }
    : {
        declaredHostPermissions,
        extensionVersion: manifest.version,
      };

  const permissionPattern = normalized.details?.url
    ? permissionPatternForUrl(normalized.details.url)
    : null;

  if (permissionPattern) {
    try {
      details.hostPermissionGranted = await chrome.permissions.contains({
        origins: [permissionPattern],
      });
    } catch (permissionError) {
      console.warn(
        "[9Router Quota Checker] Unable to inspect host permission",
        permissionPattern,
        permissionError,
      );
    }
  }

  const serialized: SerializedError = {
    code: normalized.code,
    message: normalized.message,
    status: normalized.status,
    details,
  };

  console.error("[9Router Quota Checker] Request failed", serialized, normalized);
  return { ok: false, error: serialized };
}

async function refresh(): Promise<BackgroundResponse> {
  try {
    const settings = await getSettings();
    const client = new NineRouterClient(settings.baseUrl);
    const cache = await refreshAllQuotas(client, {
      activeOnly: settings.activeOnly,
      concurrency: 4,
    });
    await saveQuotaCache(cache);
    return success(cache);
  } catch (error) {
    return failure(error);
  }
}

async function probeRouter(): Promise<BackgroundResponse<RouterProbeResult>> {
  try {
    const settings = await getSettings();
    const client = new NineRouterClient(settings.baseUrl);
    const health = await client.getHealth();
    const version = await client.assertCompatibleVersion();
    const connections = await client.getProviderConnections(settings.activeOnly);
    return success({ health, version, connectionCount: connections.length });
  } catch (error) {
    return failure(error);
  }
}

async function handleMessage(request: BackgroundRequest): Promise<BackgroundResponse> {
  switch (request.type) {
    case "GET_STATE": {
      const state: ExtensionState = {
        settings: await getSettings(),
        cache: await getQuotaCache(),
      };
      return success(state);
    }

    case "REFRESH_QUOTAS":
      return refresh();

    case "SAVE_SETTINGS": {
      try {
        const previous = await getSettings();
        const settings = await saveSettings(request.settings);
        if (settings.baseUrl !== previous.baseUrl) await clearQuotaCache();
        return success(settings);
      } catch (error) {
        return failure(error);
      }
    }

    case "PROBE_ROUTER":
      return probeRouter();

    case "GET_LOGIN_URL": {
      const settings = await getSettings();
      return success(new NineRouterClient(settings.baseUrl).getLoginUrl());
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void initializeStorage();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeStorage();
});

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  void (async () => {
    try {
      sendResponse(await handleMessage(message));
    } catch (error) {
      sendResponse(await failure(error));
    }
  })();
  return true;
});
