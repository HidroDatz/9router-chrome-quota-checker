// SPDX-License-Identifier: GPL-3.0-or-later

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatRemaining,
  formatReset,
  groupConnections,
  normalizeConnection,
  normalizeUsage,
  summarizeConnections,
} from '../core.js';

const connection = {
  id: 'account-1',
  provider: 'qoder',
  name: null,
  email: 'user@example.com',
  displayName: null,
};

test('normalizes sanitized connections only', () => {
  assert.equal(normalizeConnection({ provider: 'claude' }), null);
  assert.deepEqual(normalizeConnection({ id: 'a', provider: 'Claude', email: 'a@example.com' }), {
    id: 'a',
    provider: 'claude',
    name: null,
    email: 'a@example.com',
    displayName: null,
    isActive: null,
  });
});

test('keeps absolute credits separate from percentage', () => {
  const result = normalizeUsage(connection, {
    plan: 'Pro',
    quotas: {
      user: { used: 152, total: 500, remaining: 348 },
    },
  });
  assert.equal(result.buckets[0].remainingValue, 348);
  assert.equal(result.buckets[0].remainingPercent, 69.6);
  assert.equal(result.buckets[0].unit, 'credits');
  assert.equal(formatRemaining(result.buckets[0]), '70% left');
});

test('marks Google normalized quota as synthetic', () => {
  const result = normalizeUsage({ ...connection, provider: 'antigravity' }, {
    quotas: {
      flash: { used: 580, total: 1000, remaining: 420, remainingPercentage: 42 },
    },
  });
  assert.equal(result.buckets[0].syntheticScale, true);
  assert.equal(result.buckets[0].remainingValue, null);
  assert.equal(result.buckets[0].remainingPercent, 42);
});

test('distinguishes recurring reset and expiry', () => {
  const result = normalizeUsage({ ...connection, provider: 'codebuddy-cn' }, {
    quotas: {
      bonus: { used: 2, total: 10, recurring: false, resetAt: '2030-01-02T00:00:00Z' },
    },
  });
  const bucket = result.buckets[0];
  assert.equal(bucket.resetKind, 'expiry');
  assert.equal(formatReset(bucket, Date.UTC(2030, 0, 1)), 'expires 1d');
});

test('summarizes the lowest remaining quota and low accounts', () => {
  const connections = [
    normalizeUsage({ ...connection, id: 'a', provider: 'claude' }, {
      quotas: { session: { remainingPercentage: 18 } },
    }),
    normalizeUsage({ ...connection, id: 'b', provider: 'codex' }, {
      quotas: { weekly: { remainingPercentage: 75 } },
    }),
  ];
  assert.deepEqual(summarizeConnections(connections, 20), {
    lowest: 18,
    low: 1,
    numericCount: 2,
    accountCount: 2,
  });
  assert.deepEqual(groupConnections(connections).map(([provider]) => provider), ['claude', 'codex']);
});

test('treats informational providers as non-errors', () => {
  const result = normalizeUsage({ ...connection, provider: 'qwen' }, {
    message: 'Usage tracked per request.',
  });
  assert.equal(result.status, 'info');
  assert.equal(result.buckets.length, 0);
});
