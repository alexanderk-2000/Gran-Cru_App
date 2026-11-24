// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRequireAuth } from '../../server/src/middleware/requireAuth.js';

const createRes = () => {
  const res: { statusCode?: number; body?: unknown; status: (code: number) => typeof res; json: (body: unknown) => typeof res } = {
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(body) {
      res.body = body;
      return res;
    }
  };
  return res;
};

const run = async (middleware: ReturnType<typeof createRequireAuth>, authorization?: string) => {
  const req: { headers: Record<string, string>; userId?: string } = { headers: authorization ? { authorization } : {} };
  const res = createRes();
  const next = vi.fn();
  await middleware(req as never, res as never, next);
  return { req, res, next };
};

describe('requireAuth (Firebase ID token)', () => {
  it('returns 500 when the server has no Firebase project configured', async () => {
    const middleware = createRequireAuth({ verifyIdToken: vi.fn(), isConfigured: () => false });
    const { res, next } = await run(middleware, 'Bearer token');
    expect(res.statusCode).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects requests without a bearer token', async () => {
    const verifyIdToken = vi.fn();
    const { res, next } = await run(createRequireAuth({ verifyIdToken }));
    expect(res.statusCode).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a valid token and exposes the uid', async () => {
    const verifyIdToken = vi.fn().mockResolvedValue({ uid: 'user-123' });
    const { req, next } = await run(createRequireAuth({ verifyIdToken }), 'Bearer good-token');
    expect(verifyIdToken).toHaveBeenCalledWith('good-token');
    expect(req.userId).toBe('user-123');
    expect(next).toHaveBeenCalledOnce();
  });

  it('maps firebase auth errors to 401', async () => {
    const verifyIdToken = vi.fn().mockRejectedValue(Object.assign(new Error('expired'), { code: 'auth/id-token-expired' }));
    const { res, next } = await run(createRequireAuth({ verifyIdToken }), 'Bearer old-token');
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('maps infrastructure errors to 502', async () => {
    const verifyIdToken = vi.fn().mockRejectedValue(new Error('network down'));
    const { res } = await run(createRequireAuth({ verifyIdToken }), 'Bearer token');
    expect(res.statusCode).toBe(502);
  });
});
