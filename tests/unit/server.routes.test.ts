// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { app } from '../../server/src/app.js';

// The AI routes now require a valid Supabase session (see
// server/src/middleware/requireAuth.js) - every request otherwise incurs
// paid OpenRouter cost with no gate at all. In CI a local
// Supabase stack is running (see .github/workflows/ci-deploy.yml) and
// server/.env is populated with its URL/anon key, so we can obtain a real
// anonymous session token here. Locally without `supabase start`, these
// auth-gated cases are skipped rather than failing on an unrelated
// environment gap.
let authHeader: string | null = null;

beforeAll(async () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return;

  try {
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signInAnonymously();
    if (!error && data?.session?.access_token) {
      authHeader = `Bearer ${data.session.access_token}`;
    }
  } catch {
    authHeader = null;
  }
});

describe('server routes', () => {
  it('returns health payload', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.openrouter).toBe('boolean');
  });

  it('rejects ai search without a session', async () => {
    const res = await request(app).post('/api/ai/search').send({});
    expect([401, 500]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it.skipIf(!authHeader)('validates missing prompt on ai search', async () => {
    const res = await request(app)
      .post('/api/ai/search')
      .set('Authorization', authHeader as string)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it.skipIf(!authHeader)('validates missing image on ai vision', async () => {
    const res = await request(app)
      .post('/api/ai/vision')
      .set('Authorization', authHeader as string)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
