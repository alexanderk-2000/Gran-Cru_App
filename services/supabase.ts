
import { createClient } from '@supabase/supabase-js';

/**
 * Get environment variable with proper fallback handling
 */
const getEnv = (key: string): string => {
  try {
    // Check for process.env (Node/Shimmed standard)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }

    // Fallback for Vite-like meta env if it exists
    const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    if (metaEnv && metaEnv[key]) {
      return metaEnv[key] || '';
    }
  } catch {
    // Ignore errors
  }
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

// Validate required environment variables
if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY');

  throw new Error(
    `❌ Missing required Supabase configuration!\n\n` +
    `Missing variables: ${missing.join(', ')}\n\n` +
    `Please create a .env.local file in the project root with:\n` +
    `VITE_SUPABASE_URL=your-supabase-url\n` +
    `VITE_SUPABASE_ANON_KEY=your-supabase-anon-key\n\n` +
    `See .env.example for reference.`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
