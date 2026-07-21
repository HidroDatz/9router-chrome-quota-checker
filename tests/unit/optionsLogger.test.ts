import { describe, expect, it, vi } from "vitest";
import { logConnectionError } from "../../src/options/connectionLogger";

describe("options connection logging", () => {
  it("logs 9Router connection failures to the console", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logConnectionError({
      action: "test-connection",
      baseUrl: "http://localhost:20128",
      error: {
        code: "OFFLINE",
        message: "Unable to reach 9Router",
        status: null,
      },
    });

    expect(errorSpy).toHaveBeenCalledWith("9Router connection failed", {
      action: "test-connection",
      baseUrl: "http://localhost:20128",
      code: "OFFLINE",
      status: null,
      message: "Unable to reach 9Router",
    });

    errorSpy.mockRestore();
  });
});
