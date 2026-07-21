import { describe, expect, it } from "vitest";
import { assertSupportedBaseUrl, isLoopbackBaseUrl, normalizeBaseUrl, routerUrl } from "../../src/shared/url";

describe("9Router URL helpers", () => {
  it("normalizes trailing slashes and strips query/hash", () => {
    expect(normalizeBaseUrl(" http://localhost:20128///?x=1#top ")).toBe("http://localhost:20128");
  });
  it("preserves an optional path prefix", () => {
    expect(routerUrl("https://localhost/router", "/api/health")).toBe("https://localhost/router/api/health");
  });
  it("rejects embedded credentials and unsafe protocols", () => {
    const credentialUrl = new URL("http://localhost:20128");
    credentialUrl.username = "u";
    credentialUrl.password = "p";
    expect(() => normalizeBaseUrl(credentialUrl.toString())).toThrow(/must not be embedded/i);
    expect(() => normalizeBaseUrl("javascript:alert(1)")).toThrow(/Only http/i);
  });
  it("accepts only loopback hosts for milestones 0-3", () => {
    expect(isLoopbackBaseUrl("http://127.0.0.1:20128")).toBe(true);
    expect(() => assertSupportedBaseUrl("https://router.example.com")).toThrow(/local 9Router/i);
  });
});
