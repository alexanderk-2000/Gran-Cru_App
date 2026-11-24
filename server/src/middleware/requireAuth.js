// Every /api/ai/* route incurs paid OpenRouter cost, so each request must
// carry a valid Firebase ID token (anonymous/demo users have one too).
//
// `verifyIdToken` is injected so the middleware stays testable; app.js
// wires it to firebase-admin. Returning null from `isConfigured` means the
// server has no Firebase project to verify against.
export const createRequireAuth = ({ verifyIdToken, isConfigured = () => true }) => {
  return async (req, res, next) => {
    if (!isConfigured()) {
      return res.status(500).json({
        success: false,
        error: 'Server auth not configured (FIREBASE_PROJECT_ID missing).'
      });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing bearer token' });
    }

    try {
      const decoded = await verifyIdToken(token);
      if (!decoded?.uid) {
        return res.status(401).json({ success: false, error: 'Invalid or expired session' });
      }
      req.userId = decoded.uid;
      return next();
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : '';
      if (code.startsWith('auth/')) {
        return res.status(401).json({ success: false, error: 'Invalid or expired session' });
      }
      return res.status(502).json({ success: false, error: 'Auth service unreachable' });
    }
  };
};
