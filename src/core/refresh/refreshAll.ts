import { asRouterClientError, RouterClientError } from "../client/errors";
import { NineRouterClient } from "../client/nineRouterClient";
import { normalizeUsageResponse } from "../quota/normalize";
import type {
  ConnectionQuotaSnapshot,
  ProviderConnection,
  QuotaCache,
  SnapshotStatus,
} from "../quota/types";
import { mapWithConcurrency } from "./concurrency";

export interface RefreshAllOptions {
  activeOnly?: boolean;
  concurrency?: number;
  now?: () => Date;
}

function getAccountLabel(connection: ProviderConnection): string | null {
  return connection.name?.trim() || connection.email?.trim() || connection.displayName?.trim() || null;
}

function statusForError(error: RouterClientError): SnapshotStatus {
  if (error.code === "AUTH_REQUIRED") return "auth-required";
  if (error.code === "OFFLINE") return "offline";
  return "error";
}

function errorSnapshot(
  connection: ProviderConnection,
  error: unknown,
  fetchedAt: string,
  routerVersion: string | null,
): ConnectionQuotaSnapshot {
  const normalized = asRouterClientError(error);
  return {
    schemaVersion: 1,
    connectionId: connection.id,
    provider: connection.provider,
    accountLabel: getAccountLabel(connection),
    plan: null,
    status: statusForError(normalized),
    buckets: [],
    message: normalized.message,
    fetchedAt,
    routerVersion,
  };
}

export async function refreshAllQuotas(
  client: NineRouterClient,
  options: RefreshAllOptions = {},
): Promise<QuotaCache> {
  const now = options.now ?? (() => new Date());
  const fetchedAt = now().toISOString();
  const concurrency = options.concurrency ?? 4;
  const activeOnly = options.activeOnly ?? true;

  await client.getHealth();
  const version = await client.assertCompatibleVersion();
  const connections = await client.getProviderConnections(activeOnly);

  const snapshots = await mapWithConcurrency(
    connections,
    concurrency,
    async (connection) => {
      try {
        const usage = await client.getUsage(connection.id);
        return normalizeUsageResponse(connection, usage, {
          fetchedAt,
          routerVersion: version.currentVersion,
        });
      } catch (error) {
        return errorSnapshot(connection, error, fetchedAt, version.currentVersion);
      }
    },
  );

  return {
    schemaVersion: 1,
    baseUrl: client.baseUrl,
    routerVersion: version.currentVersion,
    fetchedAt,
    connections: snapshots,
  };
}
