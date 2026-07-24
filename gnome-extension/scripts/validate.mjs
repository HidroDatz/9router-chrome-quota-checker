// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const runtimeFiles = ['extension.js', 'prefs.js', 'client.js', 'core.js', 'secret.js'];
for (const file of runtimeFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file} failed syntax validation:\n${result.stderr}`);
}

const metadata = JSON.parse(readFileSync('metadata.json', 'utf8'));
assert.equal(metadata.uuid, 'nine-router-quota@hidrodatz.github.io');
assert.equal(metadata['settings-schema'], 'org.gnome.shell.extensions.nine-router-quota');
assert.ok(Array.isArray(metadata['shell-version']));
for (const version of ['45', '46', '47', '48', '49', '50']) {
  assert.ok(metadata['shell-version'].includes(version), `missing GNOME Shell ${version}`);
}
assert.match(metadata.url, /^https:\/\/github\.com\/HidroDatz\//);

const schema = readFileSync('schemas/org.gnome.shell.extensions.nine-router-quota.gschema.xml', 'utf8');
assert.match(schema, /id="org\.gnome\.shell\.extensions\.nine-router-quota"/);
assert.doesNotMatch(schema, /name="password"|name="auth-cookie"/, 'secrets must not be stored in GSettings');

console.log('GNOME extension validation passed');
