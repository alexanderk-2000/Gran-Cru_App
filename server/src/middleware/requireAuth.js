// The /api/ai/* routes had no auth check at all: any request that could
// reach the server could trigger paid OpenAI/Gemini/OpenRouter (now
// OpenRouter-only) calls. This validates the Supabase session JWT the
// client already holds (anonymous/demo sessions included - they still
// carry a valid access token) before letting a request reach the AI
// runtime.
//
// Deliberately a plain fetch against GoTrue's REST endpoint instead of
// the @supabase/supabase-js SDK: constructing a SupabaseClient always
// eagerly builds a RealtimeClient too, which throws ("native WebSocket
// not found") on Node <22 with no polyfill - exactly the Node version CI
// runs on. Verifying a bearer token needs none of that.
export const createRequireAuth = ({ supabaseUrl, supabaseAnonKey }) => {
  const userEndpoint = supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user` : null;

  return async (req, res, next) => {
    if (!userEndpoint || !supabaseAnonKey) {
      return res.status(500).json({
        success: false,
        error: 'Server auth not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing).'
      });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing bearer token' });
    }

    try {
      const response = await fetch(userEndpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey
        }
      });

      if (!response.ok) {
        return res.status(401).json({ success: false, error: 'Invalid or expired session' });
      }

      const user = await response.json();
      if (!user?.id) {
        return res.status(401).json({ success: false, error: 'Invalid or expired session' });
      }

      req.userId = user.id;
      next();
    } catch {
      return res.status(502).json({ success: false, error: 'Auth service unreachable' });
    }
  };
};
