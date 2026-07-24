// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {
  formatRemaining,
  formatReset,
  groupConnections,
  providerName,
  summarizeConnections,
} from './core.js';
import { NineRouterClient, NineRouterError } from './client.js';

const AUTH_MODES = new Set(['none', 'password', 'cookie']);

function disabledItem(text, styleClass = null) {
  const item = new PopupMenu.PopupMenuItem(text, { reactive: false });
  if (styleClass) item.label.add_style_class_name(styleClass);
  return item;
}

function errorText(error) {
  if (error instanceof NineRouterError) {
    if (error.code === 'AUTH_REQUIRED') return 'Authentication required. Open Preferences and save a password or cookie.';
    if (error.code === 'OFFLINE') return '9Router is offline or unreachable.';
    if (error.code === 'INCOMPATIBLE_VERSION') return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export default class NineRouterQuotaExtension extends Extension {
  enable() {
    this._enabled = true;
    this._refreshing = false;
    this._snapshot = null;
    this._lastError = null;
    this._lastRefreshStarted = 0;
    this._timeoutId = null;
    this._settingsSignal = null;
    this._menuSignal = null;
    this._alerted = new Set();

    this._settings = this.getSettings();
    try {
      this._client = this._createClient();
    } catch (error) {
      this._client = null;
      this._lastError = error;
    }

    this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);
    this._panelBox = new St.BoxLayout({
      style_class: 'panel-status-menu-box nine-router-quota-panel',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._icon = new St.Icon({
      icon_name: 'network-server-symbolic',
      style_class: 'system-status-icon',
    });
    this._label = new St.Label({
      text: '9R …',
      style_class: 'nine-router-quota-label',
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._panelBox.add_child(this._icon);
    this._panelBox.add_child(this._label);
    this._indicator.add_child(this._panelBox);
    Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');

    this._menuSignal = this._indicator.menu.connect('open-state-changed', (_menu, open) => {
      if (!open) return;
      if (Date.now() - this._lastRefreshStarted >= 30_000) void this._refresh();
    });
    this._settingsSignal = this._settings.connect('changed', () => this._onSettingsChanged());

    this._render();
    this._schedule();
    if (this._client) void this._refresh();
  }

  disable() {
    this._enabled = false;
    if (this._timeoutId !== null) {
      GLib.Source.remove(this._timeoutId);
      this._timeoutId = null;
    }
    if (this._settings && this._settingsSignal !== null) {
      this._settings.disconnect(this._settingsSignal);
      this._settingsSignal = null;
    }
    if (this._indicator && this._menuSignal !== null) {
      this._indicator.menu.disconnect(this._menuSignal);
      this._menuSignal = null;
    }
    this._client?.destroy();
    this._client = null;
    this._indicator?.destroy();
    this._indicator = null;
    this._panelBox = null;
    this._icon = null;
    this._label = null;
    this._settings = null;
    this._snapshot = null;
    this._lastError = null;
    this._alerted.clear();
  }

  _config() {
    const authMode = this._settings.get_string('auth-mode');
    if (!AUTH_MODES.has(authMode)) throw new NineRouterError('INVALID_CONFIG', `Unsupported authentication mode: ${authMode}`);
    return {
      baseUrl: this._settings.get_string('base-url'),
      authMode,
      activeOnly: this._settings.get_boolean('active-only'),
      allowRemote: this._settings.get_boolean('allow-remote'),
      maxConnections: this._settings.get_uint('max-connections'),
      concurrency: this._settings.get_uint('concurrency'),
      timeoutMs: 15_000,
    };
  }

  _createClient() {
    return new NineRouterClient(this._config());
  }

  _onSettingsChanged() {
    if (!this._enabled) return;
    this._client?.destroy();
    this._refreshing = false;
    this._lastRefreshStarted = 0;
    try {
      this._client = this._createClient();
      this._lastError = null;
    } catch (error) {
      this._client = null;
      this._lastError = error;
    }
    this._schedule();
    this._render();
    if (this._client) void this._refresh();
  }

  _schedule() {
    if (this._timeoutId !== null) {
      GLib.Source.remove(this._timeoutId);
      this._timeoutId = null;
    }
    const seconds = this._settings.get_uint('refresh-interval');
    this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, seconds, () => {
      void this._refresh();
      return GLib.SOURCE_CONTINUE;
    });
  }

  async _refresh() {
    if (!this._enabled || this._refreshing || !this._client) return;
    const client = this._client;
    this._refreshing = true;
    this._lastRefreshStarted = Date.now();
    this._render();

    try {
      const snapshot = await client.snapshot();
      if (!this._enabled || client !== this._client) return;
      this._snapshot = snapshot;
      this._lastError = null;
      this._notifyLowQuota(snapshot);
    } catch (error) {
      if (!this._enabled || client !== this._client) return;
      if (!(error instanceof NineRouterError && error.code === 'CANCELLED')) this._lastError = error;
    } finally {
      if (this._enabled && client === this._client) {
        this._refreshing = false;
        this._render();
      }
    }
  }

  _notifyLowQuota(snapshot) {
    if (!this._settings.get_boolean('notifications')) return;
    const threshold = this._settings.get_uint('low-threshold');
    const current = new Set();

    for (const connection of snapshot.connections) {
      for (const bucket of connection.buckets) {
        if (bucket.remainingPercent === null || bucket.remainingPercent > threshold) continue;
        const key = `${connection.connectionId}:${bucket.key}:${bucket.resetAt ?? 'none'}`;
        current.add(key);
        if (this._alerted.has(key)) continue;
        const account = connection.accountLabel ? ` · ${connection.accountLabel}` : '';
        Main.notify(
          '9Router quota low',
          `${providerName(connection.provider)}${account} · ${bucket.label}: ${formatRemaining(bucket)}`,
        );
      }
    }

    this._alerted = new Set([...this._alerted].filter((key) => current.has(key)));
    for (const key of current) this._alerted.add(key);
  }

  _renderPanel() {
    if (!this._label || !this._icon) return;
    if (this._refreshing && !this._snapshot) {
      this._label.text = '9R …';
      this._icon.icon_name = 'network-transmit-receive-symbolic';
      return;
    }
    if (this._lastError) {
      this._label.text = '9R !';
      this._icon.icon_name = 'dialog-error-symbolic';
      return;
    }
    if (!this._snapshot) {
      this._label.text = '9R';
      this._icon.icon_name = 'network-server-symbolic';
      return;
    }

    const threshold = this._settings.get_uint('low-threshold');
    const summary = summarizeConnections(this._snapshot.connections, threshold);
    const percentage = summary.lowest === null ? '' : ` ${Math.round(summary.lowest)}%`;
    this._label.text = this._settings.get_boolean('show-percentage') ? `9R${percentage}` : '9R';
    this._icon.icon_name = summary.low > 0
      ? summary.lowest !== null && summary.lowest <= 10
        ? 'dialog-error-symbolic'
        : 'dialog-warning-symbolic'
      : 'network-server-symbolic';
  }

  _renderMenu() {
    if (!this._indicator) return;
    const menu = this._indicator.menu;
    menu.removeAll();

    if (this._lastError) {
      menu.addMenuItem(disabledItem(errorText(this._lastError)));
    } else if (!this._snapshot) {
      menu.addMenuItem(disabledItem(this._refreshing ? 'Loading quota…' : 'No quota data yet'));
    } else {
      const threshold = this._settings.get_uint('low-threshold');
      const summary = summarizeConnections(this._snapshot.connections, threshold);
      const lastUpdated = new Date(this._snapshot.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const summaryText = summary.lowest === null
        ? `${summary.accountCount} accounts · no numeric quota`
        : `${summary.accountCount} accounts · lowest ${Math.round(summary.lowest)}% · ${summary.low} low`;
      menu.addMenuItem(disabledItem(summaryText));
      menu.addMenuItem(disabledItem(`9Router ${this._snapshot.routerVersion} · updated ${lastUpdated}`));
      if (this._snapshot.totalConnections > this._snapshot.connections.length) {
        menu.addMenuItem(disabledItem(`Showing first ${this._snapshot.connections.length} of ${this._snapshot.totalConnections} accounts`));
      }
      menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      for (const [provider, connections] of groupConnections(this._snapshot.connections)) {
        const providerItem = new PopupMenu.PopupSubMenuMenuItem(`${providerName(provider)} (${connections.length})`);
        for (const connection of connections) {
          const title = [connection.accountLabel || 'Account', connection.plan].filter(Boolean).join(' · ');
          const accountItem = new PopupMenu.PopupSubMenuMenuItem(title);
          accountItem.label.add_style_class_name('nine-router-quota-menu-account');
          if (connection.buckets.length === 0) {
            accountItem.menu.addMenuItem(disabledItem(connection.message || 'No numeric quota'));
          } else {
            for (const bucket of connection.buckets) {
              const reset = formatReset(bucket);
              const detail = [formatRemaining(bucket), reset].filter(Boolean).join(' · ');
              accountItem.menu.addMenuItem(disabledItem(`${bucket.label} — ${detail}`, 'nine-router-quota-menu-detail'));
            }
            if (connection.message) accountItem.menu.addMenuItem(disabledItem(connection.message));
          }
          providerItem.menu.addMenuItem(accountItem);
        }
        menu.addMenuItem(providerItem);
      }
    }

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    const refreshItem = new PopupMenu.PopupMenuItem(this._refreshing ? 'Refreshing…' : 'Refresh now');
    refreshItem.setSensitive(!this._refreshing && Boolean(this._client));
    refreshItem.connect('activate', () => void this._refresh());
    menu.addMenuItem(refreshItem);

    const dashboardItem = new PopupMenu.PopupMenuItem('Open 9Router dashboard');
    dashboardItem.connect('activate', () => {
      try {
        Gio.AppInfo.launch_default_for_uri(this._settings.get_string('base-url'), null);
      } catch (error) {
        Main.notifyError('Could not open 9Router', error instanceof Error ? error.message : String(error));
      }
    });
    menu.addMenuItem(dashboardItem);

    const preferencesItem = new PopupMenu.PopupMenuItem('Preferences');
    preferencesItem.connect('activate', () => this.openPreferences());
    menu.addMenuItem(preferencesItem);
  }

  _render() {
    this._renderPanel();
    this._renderMenu();
  }
}
