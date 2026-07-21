import type { SerializedError } from "./messages";

function chromeMajorVersion(userAgent?: string): number | null {
  if (!userAgent) return null;
  const match = userAgent.match(/(?:Chrome|Chromium)\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function diagnosticHint(error: SerializedError): string | null {
  const details = error.details;
  if (details?.hostPermissionGranted === false) {
    return "Chrome has withheld host access. Open Manage extension → Site access and allow localhost/127.0.0.1.";
  }
  if (details?.navigatorOnline === false) {
    return "The extension service worker reports that the browser is offline.";
  }
  if (error.code === "AUTH_REQUIRED") {
    return "Sign in using the same hostname shown in Request URL; localhost and 127.0.0.1 use different cookies.";
  }
  if (details?.causeMessage?.toLowerCase().includes("failed to fetch")) {
    return "The failure happened inside Chrome's extension service worker. A successful curl request does not verify Chrome host access, browser policy, proxy, or local-network restrictions.";
  }
  return null;
}

export function diagnosticLines(error: SerializedError): string[] {
  const details = error.details;
  const lines = [
    `Error code: ${error.code}`,
    `Message: ${error.message}`,
  ];

  if (details?.extensionVersion) lines.push(`Extension version: ${details.extensionVersion}`);
  if (error.status !== null) lines.push(`HTTP status: ${error.status}`);
  if (details?.stage) lines.push(`Stage: ${details.stage}`);
  if (details?.method || details?.url) {
    lines.push(`Request: ${details.method ?? "GET"} ${details.url ?? "unknown"}`);
  }
  if (typeof details?.elapsedMs === "number") {
    lines.push(`Elapsed: ${details.elapsedMs} ms`);
  }
  if (typeof details?.timedOut === "boolean") {
    lines.push(`Timed out: ${details.timedOut ? "yes" : "no"}`);
  }
  if (details?.causeName || details?.causeMessage) {
    lines.push(`Cause: ${[details.causeName, details.causeMessage].filter(Boolean).join(": ")}`);
  }
  if (typeof details?.hostPermissionGranted === "boolean") {
    lines.push(`Chrome host permission: ${details.hostPermissionGranted ? "granted" : "not granted"}`);
  }
  if (typeof details?.navigatorOnline === "boolean") {
    lines.push(`Browser online: ${details.navigatorOnline ? "yes" : "no"}`);
  }
  const chromeVersion = chromeMajorVersion(details?.browserUserAgent);
  if (chromeVersion !== null) lines.push(`Chrome/Chromium major: ${chromeVersion}`);
  if (details?.browserUserAgent) lines.push(`User agent: ${details.browserUserAgent}`);
  if (details?.declaredHostPermissions?.length) {
    lines.push(`Declared host permissions: ${details.declaredHostPermissions.join(", ")}`);
  }

  const hint = diagnosticHint(error);
  if (hint) lines.push(`Hint: ${hint}`);
  return lines;
}

export function createTechnicalDetails(error: SerializedError): HTMLDetailsElement {
  const root = document.createElement("details");
  root.className = "technical-details";

  const summary = document.createElement("summary");
  summary.textContent = "Technical details";

  const pre = document.createElement("pre");
  pre.textContent = diagnosticLines(error).join("\n");

  root.append(summary, pre);
  return root;
}
