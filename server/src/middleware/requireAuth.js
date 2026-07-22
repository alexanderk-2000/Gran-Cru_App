import { createClient } from '@supabase/supabase-js';

// The /api/ai/* routes had no auth check at all: any request that could
// reach the server could trigger paid OpenAI/Gemini/OpenRouter calls.
// This validates the Supabase session JWT the client already holds
// (anonymous/demo sessions included - they still carry a valid access
// token) before letting a request reach the AI runtime.
export const createRequireAuth = ({ supabaseUrl, supabaseAnonKey }) => {
  const client = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
    : null;

  return async (req, res, next) => {
    if (!client) {
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

    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    req.userId = data.user.id;
    next();
  };
};
