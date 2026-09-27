// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkApiHealth } from '../../services/apiHealth.ts';

const mockFetch = (init: { status?: number; contentType?: string; body?: unknown }) => {
  const response = {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? init.contentType ?? null : null) },
    json: async () => init.body
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkApiHealth', () => {
  it('reports online for the real health payload', async () => {
    mockFetch({ contentType: 'application/json', body: { status: 'ok', openrouter: true } });

    const health = await checkApiHealth();

    expect(health.online).toBe(true);
    expect(health.openrouterConfigured).toBe(true);
    expect(health.wrongResponder).toBe(false);
  });

  // The regression this guards: with no backend deployed, the SPA fallback
  // answers /api/health with index.html at status 200. Checking `response.ok`
  // alone reported "API-Server online" while every AI call was failing.
  it('does not treat the SPA fallback as a healthy API', async () => {
    mockFetch({ contentType: 'text/html; charset=utf-8', body: undefined });

    const health = await checkApiHealth();

    expect(health.online).toBe(false);
    expect(health.wrongResponder).toBe(true);
  });

  it('rejects JSON that is not the health payload', async () => {
    mockFetch({ contentType: 'application/json', body: { hello: 'world' } });

    const health = await checkApiHealth();

    expect(health.online).toBe(false);
    expect(health.wrongResponder).toBe(true);
  });

  it('reports a running server without an AI key as online but unconfigured', async () => {
    mockFetch({ contentType: 'application/json', body: { status: 'ok', openrouter: false } });

    const health = await checkApiHealth();

    expect(health.online).toBe(true);
    expect(health.openrouterConfigured).toBe(false);
  });

  it('treats a network failure as offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const health = await checkApiHealth();

    expect(health.online).toBe(false);
  });
});
