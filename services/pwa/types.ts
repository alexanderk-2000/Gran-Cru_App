import type {
  CellarPocket,
  Occasion,
  OccasionInstance,
  OccasionWinePoolEntry,
  Tasting,
  Wine,
} from '../../types.ts';

export type QueueState = 'queued' | 'syncing' | 'synced' | 'failed' | 'dead_letter';

export interface OfflineQueueItem {
  id: string;
  user_id: string;
  type: 'write';
  entity: string;
  operation: string;
  payload: Record<string, unknown>;
  client_ts: string;
  status: QueueState;
  retry_count: number;
  next_retry_at: string | null;
  dedupe_key: string;
  last_error: string | null;
}

export interface SyncConflictRecord {
  id: string;
  user_id: string;
  entity: string;
  entity_id: string;
  local_updated_at: string | null;
  remote_updated_at: string | null;
  resolution: 'local_wins' | 'remote_wins';
  created_at: string;
  details: Record<string, unknown>;
}

export interface SyncStateSnapshot {
  online: boolean;
  last_sync_started_at: string | null;
  last_sync_completed_at: string | null;
  last_sync_error: string | null;
  write_queue_pending: number;
  write_queue_failed: number;
  syncing: boolean;
}

export interface OfflineMetaRecord {
  key: string;
  value: unknown;
  updated_at: string;
}

export type OfflineEntity =
  | 'wines'
  | 'tastings'
  | 'occasions'
  | 'occasion_instances'
  | 'occasion_wine_pool'
  | 'inventory_events'
  | 'cellar_pockets';

export interface FullDatasetSnapshot {
  user_id: string;
  wines: Wine[];
  deleted_wines: Wine[];
  tastings: Tasting[];
  occasions: Occasion[];
  occasion_instances: OccasionInstance[];
  occasion_wine_pool: OccasionWinePoolEntry[];
  cellar_pockets: CellarPocket[];
  inventory_events: Array<Record<string, unknown>>;
  pulled_at: string;
}

export interface QueueOperationInput {
  entity: string;
  operation: string;
  args: unknown[];
  dedupe_key: string;
}
