# Vercel Deployment Setup

The application shows a blank screen because it is missing required environment variables and/or routing configuration.

## 1. Environment Variables
You MUST add the following Environment Variables in your Vercel Project Settings (Settings -> Environment Variables):

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | Your Supabase Project URL (found in `.env` or Supabase Dashboard) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase Anon Key (found in `.env` or Supabase Dashboard) |

**Note:** The application will crash immediately (blank screen) if these are missing.

## 2. Routing Configuration
A `vercel.json` file has been added to the repository to handle client-side routing (redirecting all traffic to `index.html`). This fixes 404 errors when refreshing pages like `/dashboard`.

## 3. Redeploy
After adding the environment variables, you must **Redeploy** the application in Vercel for the changes to take effect.
