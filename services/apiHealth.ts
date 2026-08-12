/**
 * Health probe for the API backend.
 *
 * Checking only `response.ok` is not enough: when no backend is mounted, the
 * SPA fallback answers *every* path - including /api/health - with index.html
 * at status 200. That made a missing backend look healthy. A backend only
 * counts as reachable when it answers with the JSON payload the health route
 * actually produces (`server/src/routes/health.js`).
 */
export interface ApiHealth {
  online: boolean;
  /** True when something answered but it was not our API (e.g. the SPA fallback). */
  wrongResponder: boolean;
  openrouterConfigured: boolean;
}

const OFFLINE: ApiHealth = { online: false, wrongResponder: false, openrouterConfigured: false };

export const checkApiHealth = async (): Promise<ApiHealth> => {
  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) return OFFLINE;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { ...OFFLINE, wrongResponder: true };
    }

    const payload = await response.json().catch(() => null);
    if (!payload || payload.status !== 'ok') {
      return { ...OFFLINE, wrongResponder: true };
    }

    return {
      online: true,
      wrongResponder: false,
      openrouterConfigured: Boolean(payload.openrouter)
    };
  } catch {
    return OFFLINE;
  }
};
