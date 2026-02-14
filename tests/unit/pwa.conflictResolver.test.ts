import { describe, expect, it } from 'vitest';
import { resolveLastWriteWins } from '../../services/pwa/conflictResolver.ts';

describe('resolveLastWriteWins', () => {
  it('prefers remote data when remote is newer', () => {
    const result = resolveLastWriteWins({
      userId: 'user-1',
      entity: 'wines',
      local: {
        id: 'wine-1',
        updated_at: '2026-02-01T10:00:00.000Z',
        name: 'Local'
      },
      remote: {
        id: 'wine-1',
        updated_at: '2026-02-01T12:00:00.000Z',
        name: 'Remote'
      }
    });

    expect(result.resolved.name).toBe('Remote');
    expect(result.conflict?.resolution).toBe('remote_wins');
  });

  it('prefers local data when local is newer', () => {
    const result = resolveLastWriteWins({
      userId: 'user-1',
      entity: 'wines',
      local: {
        id: 'wine-1',
        updated_at: '2026-02-01T12:00:00.000Z',
        name: 'Local New'
      },
      remote: {
        id: 'wine-1',
        updated_at: '2026-02-01T10:00:00.000Z',
        name: 'Remote Old'
      }
    });

    expect(result.resolved.name).toBe('Local New');
    expect(result.conflict?.resolution).toBe('local_wins');
  });
});
