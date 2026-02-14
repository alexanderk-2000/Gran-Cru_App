// @vitest-environment node
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/app.js';

describe('server routes', () => {
  it('returns health payload', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.gemini).toBe('boolean');
  });

  it('validates missing prompt on ai search', async () => {
    const res = await request(app).post('/api/ai/search').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('validates missing image on ai vision', async () => {
    const res = await request(app).post('/api/ai/vision').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
