// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import { isRecord, normalizeConnection, normalizeUsage } from './core.js';
import { lookupSecret } from './secret.js';

const MINIMUM_VERSION = [0, 5, 40];

export class NineRouterError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'NineRouterError';
    this.code = code;
    this.status = status;
  }
}

export function normalizeBaseUrl(value, allowRemote = false) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new NineRouterError('INVALID_CONFIG', '9Router URL must use HTTP or HTTPS');
  }
  if (url.username || url.password) {
    throw new NineRouterError('INVALID_CONFIG', 'Do not place credentials in the 9Router URL');
  }
  if (url.search || url.hash) {
    throw new NineRouterError('INVALID_CONFIG', '9Router URL must not contain a query string or fragment');
  }
  const loopback = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!loopback.has(url.hostname)) {
    if (!allowRemote) throw new NineRouterError('INVALID_CONFIG', 'Remote 9Router origins require Allow remote');
    if (url.protocol !== 'https:') throw new NineRouterError('INVALID_CONFIG', 'Remote 9Router origins must use HTTPS');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function versionParts(value) {
  const match = String(value ?? '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

export function isCompatibleVersion(value) {
  const parts = versionParts(value);
  if (!parts) return false;
  for (let index = 0; index < MINIMUM_VERSION.length; index += 1) {
    if (parts[index] > MINIMUM_VERSION[index]) return true;
    if (parts[index] < MINIMUM_VERSION[index]) return false;
  }
  return true;
}

export async function mapLimit(values, concurrency, worker) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await worker(values[index], index);
      }
    }),
  );
  return output;
}

function sendAndRead(session, message, cancellable) {
  return new Promise((resolve, reject) => {
    session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (source, result) => {
      try {
        resolve(source.send_and_read_finish(result));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function responseMessage(payload, fallback) {
  if (!isRecord(payload)) return fallback;
  const candidate = payload.error ?? payload.message ?? payload.detail;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim().slice(0, 400) : fallback;
}

function normalizeCookie(value) {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  return trimmed.includes('auth_token=') ? trimmed : `auth_token=${trimmed}`;
}

export class NineRouterClient {
  constructor(config) {
    this._config = {
      ...config,
      baseUrl: normalizeBaseUrl(config.baseUrl, config.allowRemote),
    };
    this._session = new Soup.Session({
      timeout: Math.max(1, Math.ceil(config.timeoutMs / 1000)),
      user_agent: '9Router GNOME Quota Indicator/0.1.0',
    });
    this._cancellable = new Gio.Cancellable();
    this._cookie = null;
    this._destroyed = false;
  }

  destroy() {
    this._destroyed = true;
    this._cancellable.cancel();
    this._session.abort();
    this._cookie = null;
  }

  _url(path) {
    return new URL(`${this._config.baseUrl}${path}`).toString();
  }

  async _prepareAuth() {
    if (this._config.authMode !== 'cookie' || this._cookie) return;
    this._cookie = normalizeCookie(await lookupSecret('cookie', this._cancellable));
  }

  async _sendRaw(method, path, body = null, includeAuth = true) {
    if (this._destroyed) throw new NineRouterError('CANCELLED', '9Router client is disabled');
    const message = Soup.Message.new(method, this._url(path));
    const requestHeaders = message.get_request_headers();
    requestHeaders.append('Accept', 'application/json');
    if (includeAuth && this._cookie) requestHeaders.append('Cookie', this._cookie);
    if (body !== null) {
      const bytes = GLib.Bytes.new(new TextEncoder().encode(JSON.stringify(body)));
      message.set_request_body_from_bytes('application/json', bytes);
    }

    let responseBytes;
    try {
      responseBytes = await sendAndRead(this._session, message, this._cancellable);
    } catch (error) {
      if (this._cancellable.is_cancelled()) throw new NineRouterError('CANCELLED', '9Router request cancelled');
      throw new NineRouterError('OFFLINE', `Cannot reach 9Router: ${error instanceof Error ? error.message : String(error)}`);
    }

    const status = message.get_status();
    const text = new TextDecoder().decode(responseBytes.get_data());
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new NineRouterError('INVALID_RESPONSE', `9Router returned malformed JSON for ${path}`, status);
      }
    }
    return { status, payload, message };
  }

  async _login() {
    const password = await lookupSecret('password', this._cancellable);
    if (!password) return false;
    const response = await this._sendRaw('POST', '/api/auth/login', { password }, false);
    if (response.status < 200 || response.status >= 300) return false;
    const setCookie = response.message.get_response_headers().get_one('Set-Cookie') ?? '';
    const match = /(?:^|,\s*)auth_token=([^;]+)/.exec(setCookie);
    if (!match?.[1]) return false;
    this._cookie = `auth_token=${match[1]}`;
    return true;
  }

  async _request(method, path, body = null, retry = true) {
    await this._prepareAuth();
    let response = await this._sendRaw(method, path, body);
    if (response.status === 401 && retry && this._config.authMode === 'password' && await this._login()) {
      response = await this._sendRaw(method, path, body);
    }

    if (response.status === 401) {
      throw new NineRouterError('AUTH_REQUIRED', responseMessage(response.payload, '9Router authentication is required'), 401);
    }
    if (response.status === 403) {
      throw new NineRouterError('FORBIDDEN', responseMessage(response.payload, '9Router rejected this request'), 403);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new NineRouterError('HTTP_ERROR', responseMessage(response.payload, `9Router returned HTTP ${response.status}`), response.status);
    }
    if (!isRecord(response.payload)) {
      throw new NineRouterError('INVALID_RESPONSE', `9Router returned invalid JSON for ${path}`, response.status);
    }
    return response.payload;
  }

  async health() {
    const payload = await this._request('GET', '/api/health');
    if (payload.ok !== true) throw new NineRouterError('INVALID_RESPONSE', '9Router health check did not return ok: true');
  }

  async version() {
    const payload = await this._request('GET', '/api/version');
    const version = typeof payload.currentVersion === 'string' ? payload.currentVersion : null;
    if (!version || !isCompatibleVersion(version)) {
      throw new NineRouterError('INCOMPATIBLE_VERSION', `9Router ${version ?? 'unknown'} is below the required 0.5.40`);
    }
    return version;
  }

  async connections() {
    const output = [];
    for (let page = 1; page <= 100; page += 1) {
      const query = new URLSearchParams({
        accountStatus: this._config.activeOnly ? 'active' : 'all',
        sort: 'priority',
        page: String(page),
        pageSize: '100',
      });
      const payload = await this._request('GET', `/api/providers/client?${query.toString()}`);
      const rows = Array.isArray(payload.connections) ? payload.connections : [];
      output.push(...rows.map(normalizeConnection).filter(Boolean));
      const pagination = isRecord(payload.pagination) ? payload.pagination : null;
      const totalPages = pagination && typeof pagination.totalPages === 'number' ? pagination.totalPages : page;
      if (page >= totalPages || rows.length === 0) break;
    }
    return output;
  }

  async usage(connectionId) {
    return this._request('GET', `/api/usage/${encodeURIComponent(connectionId)}`);
  }

  async snapshot() {
    await this.health();
    const [routerVersion, allConnections] = await Promise.all([this.version(), this.connections()]);
    const connections = allConnections.slice(0, this._config.maxConnections);
    const snapshots = await mapLimit(connections, this._config.concurrency, async (connection) => {
      try {
        return normalizeUsage(connection, await this.usage(connection.id));
      } catch (error) {
        return normalizeUsage(connection, {}, error instanceof Error ? error.message : String(error));
      }
    });
    return {
      routerVersion,
      fetchedAt: Date.now(),
      totalConnections: allConnections.length,
      connections: snapshots,
    };
  }
}
