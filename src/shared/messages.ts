import type {
  ExtensionSettings,
  QuotaCache,
  RouterProbeResult,
} from "../core/quota/types";
import type { RouterClientErrorCode } from "../core/client/errors";

export type BackgroundRequest =
  | { type: "GET_STATE" }
  | { type: "REFRESH_QUOTAS" }
  | { type: "SAVE_SETTINGS"; settings: Partial<ExtensionSettings> }
  | { type: "PROBE_ROUTER" }
  | { type: "GET_LOGIN_URL" };

export interface ExtensionState {
  settings: ExtensionSettings;
  cache: QuotaCache | null;
}

export interface SerializedError {
  code: RouterClientErrorCode | "UNKNOWN";
  message: string;
  status: number | null;
}

export type BackgroundResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: SerializedError };

export type GetStateResponse = BackgroundResponse<ExtensionState>;
export type RefreshResponse = BackgroundResponse<QuotaCache>;
export type SaveSettingsResponse = BackgroundResponse<ExtensionSettings>;
export type ProbeResponse = BackgroundResponse<RouterProbeResult>;
export type LoginUrlResponse = BackgroundResponse<string>;
