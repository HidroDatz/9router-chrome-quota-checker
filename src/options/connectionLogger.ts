import type { SerializedError } from "../shared/messages";

interface ConnectionErrorLog {
  action: "save-settings" | "test-connection";
  baseUrl: string;
  error: SerializedError;
}

export function logConnectionError(log: ConnectionErrorLog): void {
  console.error("9Router connection failed", {
    action: log.action,
    baseUrl: log.baseUrl,
    code: log.error.code,
    status: log.error.status,
    message: log.error.message,
  });
}
