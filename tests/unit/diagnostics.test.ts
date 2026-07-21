import { describe, expect, it } from "vitest";
import { diagnosticLines } from "../../src/shared/diagnostics";
import type { SerializedError } from "../../src/shared/messages";

describe("diagnosticLines", () => {
  it("renders actionable fetch and permission diagnostics", () => {
    const error: SerializedError = {
      code: "OFFLINE",
      message: "Browser fetch failed during health.",
      status: null,
      details: {
        stage: "health",
        method: "GET",
        url: "http://localhost:20128/api/health",
        elapsedMs: 12,
        timedOut: false,
        causeName: "TypeError",
        causeMessage: "Failed to fetch",
        hostPermissionGranted: false,
        navigatorOnline: true,
        browserUserAgent: "Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36",
        declaredHostPermissions: ["http://localhost/*"],
      },
    };

    const text = diagnosticLines(error).join("\n");
    expect(text).toContain("Stage: health");
    expect(text).toContain("GET http://localhost:20128/api/health");
    expect(text).toContain("Cause: TypeError: Failed to fetch");
    expect(text).toContain("Chrome host permission: not granted");
    expect(text).toContain("Chrome/Chromium major: 146");
    expect(text).toContain("Manage extension");
  });

  it("explains that auth cookies are hostname-specific", () => {
    const error: SerializedError = {
      code: "AUTH_REQUIRED",
      message: "Sign in first.",
      status: 401,
      details: {
        stage: "provider-connections",
        method: "GET",
        url: "http://127.0.0.1:20128/api/providers/client",
      },
    };

    expect(diagnosticLines(error).join("\n")).toContain(
      "localhost and 127.0.0.1 use different cookies",
    );
  });
});
