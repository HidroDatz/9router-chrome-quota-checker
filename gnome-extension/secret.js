// SPDX-License-Identifier: GPL-3.0-or-later

import Secret from 'gi://Secret?version=1';

const SCHEMA = Secret.Schema.new(
  'org.gnome.shell.extensions.nine-router-quota.Secret',
  Secret.SchemaFlags.NONE,
  { kind: Secret.SchemaAttributeType.STRING },
);

const attributes = (kind) => ({ kind });

export function lookupSecret(kind, cancellable = null) {
  return new Promise((resolve, reject) => {
    Secret.password_lookup(SCHEMA, attributes(kind), cancellable, (_source, result) => {
      try {
        resolve(Secret.password_lookup_finish(result));
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function storeSecret(kind, value, cancellable = null) {
  return new Promise((resolve, reject) => {
    Secret.password_store(
      SCHEMA,
      attributes(kind),
      Secret.COLLECTION_DEFAULT,
      `9Router quota ${kind}`,
      value,
      cancellable,
      (_source, result) => {
        try {
          resolve(Secret.password_store_finish(result));
        } catch (error) {
          reject(error);
        }
      },
    );
  });
}

export function clearSecret(kind, cancellable = null) {
  return new Promise((resolve, reject) => {
    Secret.password_clear(SCHEMA, attributes(kind), cancellable, (_source, result) => {
      try {
        resolve(Secret.password_clear_finish(result));
      } catch (error) {
        reject(error);
      }
    });
  });
}
