// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { clearSecret, lookupSecret, storeSecret } from './secret.js';

const AUTH_MODES = ['none', 'password', 'cookie'];

function bindSpin(settings, key, row) {
  row.value = settings.get_uint(key);
  row.connect('notify::value', () => settings.set_uint(key, Math.round(row.value)));
}

export default class NineRouterQuotaPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();
    window._settings = settings;
    window.search_enabled = true;
    window.set_default_size(640, 720);

    const page = new Adw.PreferencesPage({
      title: '9Router Quota',
      icon_name: 'network-server-symbolic',
    });
    window.add(page);

    const connectionGroup = new Adw.PreferencesGroup({
      title: 'Connection',
      description: 'The GNOME Shell process calls the local 9Router dashboard API. Provider credentials remain inside 9Router.',
    });
    page.add(connectionGroup);

    const baseUrlRow = new Adw.EntryRow({ title: '9Router URL' });
    settings.bind('base-url', baseUrlRow, 'text', Gio.SettingsBindFlags.DEFAULT);
    connectionGroup.add(baseUrlRow);

    const authModel = Gtk.StringList.new(['No authentication', 'Dashboard password', 'Dashboard auth cookie']);
    const authRow = new Adw.ComboRow({
      title: 'Authentication',
      model: authModel,
    });
    authRow.selected = Math.max(0, AUTH_MODES.indexOf(settings.get_string('auth-mode')));
    connectionGroup.add(authRow);

    const secretRow = new Adw.PasswordEntryRow({ title: 'Dashboard secret' });
    connectionGroup.add(secretRow);

    const secretAction = new Adw.ActionRow({
      title: 'GNOME Keyring',
      subtitle: 'The password or cookie is stored by Secret Service, not in dconf.',
    });
    const saveButton = new Gtk.Button({
      label: 'Save secret',
      valign: Gtk.Align.CENTER,
      css_classes: ['suggested-action'],
    });
    secretAction.add_suffix(saveButton);
    secretAction.activatable_widget = saveButton;
    connectionGroup.add(secretAction);

    const updateSecretUi = async () => {
      const mode = AUTH_MODES[authRow.selected] ?? 'none';
      settings.set_string('auth-mode', mode);
      secretRow.visible = mode !== 'none';
      secretAction.visible = mode !== 'none';
      secretRow.title = mode === 'cookie' ? 'Dashboard auth cookie' : 'Dashboard password';
      secretRow.text = '';
      if (mode === 'none') return;
      try {
        const stored = await lookupSecret(mode);
        secretRow.text = stored ?? '';
        secretAction.subtitle = stored
          ? 'A secret is stored in GNOME Keyring.'
          : 'No secret is stored yet.';
      } catch (error) {
        secretAction.subtitle = `Could not access GNOME Keyring: ${error instanceof Error ? error.message : String(error)}`;
      }
    };

    authRow.connect('notify::selected', () => void updateSecretUi());
    saveButton.connect('clicked', async () => {
      const mode = AUTH_MODES[authRow.selected] ?? 'none';
      if (mode === 'none') return;
      saveButton.sensitive = false;
      try {
        const value = secretRow.text.trim();
        if (value) await storeSecret(mode, value);
        else await clearSecret(mode);
        secretAction.subtitle = value
          ? 'Secret saved in GNOME Keyring.'
          : 'Secret removed from GNOME Keyring.';
      } catch (error) {
        secretAction.subtitle = `Could not update GNOME Keyring: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        saveButton.sensitive = true;
      }
    });
    void updateSecretUi();

    const allowRemoteRow = new Adw.SwitchRow({
      title: 'Allow remote 9Router',
      subtitle: 'Remote instances must use HTTPS. Keep this disabled for a local installation.',
    });
    settings.bind('allow-remote', allowRemoteRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    connectionGroup.add(allowRemoteRow);

    const behaviorGroup = new Adw.PreferencesGroup({ title: 'Behavior' });
    page.add(behaviorGroup);

    const refreshRow = new Adw.SpinRow({
      title: 'Refresh interval',
      subtitle: 'Seconds between background quota refreshes.',
      adjustment: new Gtk.Adjustment({ lower: 30, upper: 3600, step_increment: 30, page_increment: 60 }),
    });
    bindSpin(settings, 'refresh-interval', refreshRow);
    behaviorGroup.add(refreshRow);

    const thresholdRow = new Adw.SpinRow({
      title: 'Low quota threshold',
      subtitle: 'Notify when a quota bucket reaches this remaining percentage.',
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 100, step_increment: 1, page_increment: 5 }),
    });
    bindSpin(settings, 'low-threshold', thresholdRow);
    behaviorGroup.add(thresholdRow);

    const notificationsRow = new Adw.SwitchRow({
      title: 'Low quota notifications',
      subtitle: 'A bucket is notified once per reset cycle while it remains below the threshold.',
    });
    settings.bind('notifications', notificationsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    behaviorGroup.add(notificationsRow);

    const percentageRow = new Adw.SwitchRow({
      title: 'Show percentage in top panel',
      subtitle: 'Display the lowest remaining numeric quota beside the 9R indicator.',
    });
    settings.bind('show-percentage', percentageRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    behaviorGroup.add(percentageRow);

    const activeOnlyRow = new Adw.SwitchRow({
      title: 'Active connections only',
      subtitle: 'Ignore inactive 9Router connections.',
    });
    settings.bind('active-only', activeOnlyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    behaviorGroup.add(activeOnlyRow);

    const advancedGroup = new Adw.PreferencesGroup({
      title: 'Advanced',
      description: 'Limits protect the GNOME Shell process and provider quota endpoints from excessive parallel work.',
    });
    page.add(advancedGroup);

    const maxConnectionsRow = new Adw.SpinRow({
      title: 'Maximum accounts per refresh',
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 100, step_increment: 1, page_increment: 10 }),
    });
    bindSpin(settings, 'max-connections', maxConnectionsRow);
    advancedGroup.add(maxConnectionsRow);

    const concurrencyRow = new Adw.SpinRow({
      title: 'Concurrent quota requests',
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 10, step_increment: 1, page_increment: 1 }),
    });
    bindSpin(settings, 'concurrency', concurrencyRow);
    advancedGroup.add(concurrencyRow);
  }
}
