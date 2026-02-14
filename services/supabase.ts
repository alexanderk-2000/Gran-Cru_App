
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

  console.error(
    `❌ Missing required Supabase configuration!\n\n` +
    `Missing variables: ${missing.join(', ')}\n\n` +
    `Please set these variables in your deployment environment (e.g. Vercel Dashboard).`
  );
}

// Create client with fallback values if missing to avoid immediate crash
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseAnonKey || 'placeholder-key'
);
