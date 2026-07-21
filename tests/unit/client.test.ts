import { describe, expect, it, vi } from "vitest";
import { RouterClientError } from "../../src/core/client/errors";
import { compareSemver, NineRouterClient } from "../../src/core/client/nineRouterClient";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

describe("NineRouterClient", () => {
  it("checks health/version and follows provider pagination", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(init?.credentials).toBe("include");
      if (url.pathname === "/api/health") return json({ ok: true });
      if (url.pathname === "/api/version") return json({ currentVersion: "0.5.40", latestVersion: "0.5.40", hasUpdate: false });
      if (url.pathname === "/api/providers/client") {
        const page = Number(url.searchParams.get("page"));
        return json({ connections: page === 1 ? [{ id: "a", provider: "claude" }] : [{ id: "b", provider: "codex" }], pagination: { page, pageSize: 100, total: 2, totalPages: 2 } });
      }
      throw new Error(`Unexpected URL ${url}`);
    }) as typeof fetch;
    const client = new NineRouterClient("http://localhost:20128", { fetchImpl });
    await expect(client.getHealth()).resolves.toEqual({ ok: true });
    await expect(client.assertCompatibleVersion()).resolves.toMatchObject({ currentVersion: "0.5.40" });
    await expect(client.getProviderConnections()).resolves.toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("preserves the failed request stage, URL, elapsed time, and root cause", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const client = new NineRouterClient("http://localhost:20128", { fetchImpl });

    await expect(client.getHealth()).rejects.toMatchObject({
      code: "OFFLINE",
      status: null,
      details: {
        stage: "health",
        method: "GET",
        url: "http://localhost:20128/api/health",
        timedOut: false,
        causeName: "TypeError",
        causeMessage: "Failed to fetch",
      },
    });

    try {
      await client.getHealth();
    } catch (error) {
      expect(error).toBeInstanceOf(RouterClientError);
      expect((error as RouterClientError).details?.elapsedMs).toBeTypeOf("number");
    }
  });

  it("maps HTTP 401 to AUTH_REQUIRED with endpoint diagnostics", async () => {
    const client = new NineRouterClient("http://localhost:20128", { fetchImpl: vi.fn(async () => json({ error: "Unauthorized" }, 401)) as typeof fetch });
    await expect(client.getProviderConnections()).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
      status: 401,
      details: {
        stage: "provider-connections",
        method: "GET",
      },
    });
  });

  it("rejects unsupported 9Router versions", async () => {
    const client = new NineRouterClient("http://localhost:20128", { fetchImpl: vi.fn(async () => json({ currentVersion: "0.5.39" })) as typeof fetch });
    await expect(client.assertCompatibleVersion()).rejects.toBeInstanceOf(RouterClientError);
    await expect(client.assertCompatibleVersion()).rejects.toMatchObject({ code: "INCOMPATIBLE_VERSION" });
  });

  it("compares semantic versions without prerelease noise", () => {
    expect(compareSemver("0.5.40", "0.5.40")).toBe(0);
    expect(compareSemver("0.5.41-beta.1", "0.5.40")).toBe(1);
    expect(compareSemver("0.5.39", "0.5.40")).toBe(-1);
  });
});
