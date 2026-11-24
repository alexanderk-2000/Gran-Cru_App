// @vitest-environment node
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../server/src/app.js';

// The AI routes require a valid Firebase ID token (see
// server/src/middleware/requireAuth.js) - every request otherwise incurs
// paid OpenRouter cost with no gate at all. In CI the Firebase Auth
// emulator is running (see .github/workflows/ci-deploy.yml), so we can mint
// a real anonymous-user token through its REST API. Locally without the
// emulator, these auth-gated cases are skipped rather than failing on an
// unrelated environment gap.
//
// Resolved with top-level await (not beforeAll): it.skipIf() is evaluated
// at collection time, before any beforeAll hook runs, so a token fetched
// in beforeAll always left these cases skipped.
const fetchEmulatorToken = async (): Promise<string | null> => {
  const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!emulatorHost || !process.env.FIREBASE_PROJECT_ID) return null;
  try {
    const response = await fetch(
      `http://${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }
    );
    const body = await response.json() as { idToken?: string };
    return body.idToken ? `Bearer ${body.idToken}` : null;
  } catch {
    return null;
  }
};

const authHeader = await fetchEmulatorToken();

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
