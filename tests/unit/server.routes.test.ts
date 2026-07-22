// @vitest-environment node
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/app.js';

describe('server routes', () => {
  it('returns health payload', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.mode).toBe('local-only');
    expect(res.body.external_ai).toBe(false);
  });

  it('does not expose an external AI search endpoint', async () => {
    const res = await request(app).post('/api/ai/search').send({});
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('does not expose an external AI vision endpoint', async () => {
    const res = await request(app).post('/api/ai/vision').send({});
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
