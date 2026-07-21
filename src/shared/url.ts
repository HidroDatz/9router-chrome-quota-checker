export const DEFAULT_BASE_URL = "http://localhost:20128";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("9Router base URL is required.");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid http:// or https:// URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  if (url.username || url.password) {
    throw new Error("Credentials must not be embedded in the URL.");
  }

  url.search = "";
  url.hash = "";
  const pathname = url.pathname.replace(/\/+$/, "");
  url.pathname = pathname || "/";
  return url.toString().replace(/\/$/, "");
}

export function isLoopbackBaseUrl(input: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(normalizeBaseUrl(input)).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function assertSupportedBaseUrl(input: string): string {
  const normalized = normalizeBaseUrl(input);
  if (!isLoopbackBaseUrl(normalized)) {
    throw new Error(
      "This release supports local 9Router instances on localhost or 127.0.0.1 only.",
    );
  }
  return normalized;
}

export function routerUrl(baseUrl: string, path: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  return new URL(path.replace(/^\/+/, ""), `${normalized}/`).toString();
}
