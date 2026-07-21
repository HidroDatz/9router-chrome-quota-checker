import { describe, expect, it, vi } from "vitest";
import { NineRouterClient } from "../../src/core/client/nineRouterClient";
import { refreshAllQuotas } from "../../src/core/refresh/refreshAll";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

describe("refreshAllQuotas", () => {
  it("limits concurrency and isolates per-connection failures", async () => {
    let activeUsageCalls = 0;
    let peakUsageCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/health") return json({ ok: true });
      if (url.pathname === "/api/version") return json({ currentVersion: "0.5.40" });
      if (url.pathname === "/api/providers/client") return json({ connections: [
        { id: "claude-1", provider: "claude", email: "one@example.test" },
        { id: "codex-1", provider: "codex", email: "two@example.test" },
        { id: "qwen-1", provider: "qwen", email: "three@example.test" }
      ], pagination: { page: 1, pageSize: 100, total: 3, totalPages: 1 } });
      if (url.pathname.startsWith("/api/usage/")) {
        activeUsageCalls += 1;
        peakUsageCalls = Math.max(peakUsageCalls, activeUsageCalls);
        await sleep(10);
        activeUsageCalls -= 1;
        if (url.pathname.endsWith("codex-1")) return json({ error: "upstream" }, 500);
        if (url.pathname.endsWith("qwen-1")) return json({ message: "Qwen connected. Usage tracked per request." });
        return json({ plan: "Claude Code", quotas: { "session (5h)": { used: 25, total: 100, remaining: 75 } } });
      }
      throw new Error(`Unexpected URL ${url}`);
    }) as typeof fetch;

    const client = new NineRouterClient("http://localhost:20128", { fetchImpl });
    const cache = await refreshAllQuotas(client, { concurrency: 2, now: () => new Date("2026-07-21T12:00:00.000Z") });
    expect(peakUsageCalls).toBeLessThanOrEqual(2);
    expect(cache.connections).toHaveLength(3);
    expect(cache.connections.find((entry) => entry.connectionId === "claude-1")?.status).toBe("ok");
    expect(cache.connections.find((entry) => entry.connectionId === "codex-1")?.status).toBe("error");
    expect(cache.connections.find((entry) => entry.connectionId === "qwen-1")?.status).toBe("info");
  });
});
