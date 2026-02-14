import type { SyncConflictRecord } from './types.ts';
import { createLocalId } from './offlineDb.ts';

interface VersionedRecord {
  id?: string;
  updated_at?: string | null;
}

export interface ConflictResolutionResult<T extends VersionedRecord> {
  resolved: T;
  conflict: SyncConflictRecord | null;
}

const toTimestamp = (value: string | null | undefined): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const resolveLastWriteWins = <T extends VersionedRecord>(params: {
  userId: string;
  entity: string;
  local: T | null;
  remote: T;
}): ConflictResolutionResult<T> => {
  const localTs = toTimestamp(params.local?.updated_at || null);
  const remoteTs = toTimestamp(params.remote.updated_at || null);

  if (!params.local) {
    return {
      resolved: params.remote,
      conflict: null
    };
  }

  if (localTs <= remoteTs) {
    if (localTs === remoteTs) {
      return {
        resolved: params.remote,
        conflict: null
      };
    }

    return {
      resolved: params.remote,
      conflict: {
        id: createLocalId('conflict'),
        user_id: params.userId,
        entity: params.entity,
        entity_id: String(params.remote.id || params.local.id || 'unknown'),
        local_updated_at: params.local.updated_at || null,
        remote_updated_at: params.remote.updated_at || null,
        resolution: 'remote_wins',
        created_at: new Date().toISOString(),
        details: {
          reason: 'last_write_wins_remote_newer'
        }
      }
    };
  }

  return {
    resolved: params.local,
    conflict: {
      id: createLocalId('conflict'),
      user_id: params.userId,
      entity: params.entity,
      entity_id: String(params.local.id || params.remote.id || 'unknown'),
      local_updated_at: params.local.updated_at || null,
      remote_updated_at: params.remote.updated_at || null,
      resolution: 'local_wins',
      created_at: new Date().toISOString(),
      details: {
        reason: 'last_write_wins_local_newer'
      }
    }
  };
};
