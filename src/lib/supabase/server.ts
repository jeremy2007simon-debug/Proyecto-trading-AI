import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Server Component / Route Handler Supabase client, scoped to the
 * signed-in user's session via cookies and subject to Row Level
 * Security. Use this for anything executed on behalf of a user.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase project credentials.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component with no request context to write
          // cookies to (e.g. during static rendering) — safe to ignore, the
          // middleware layer is responsible for refreshing the session.
        }
      },
    },
  });
}

/**
 * Privileged client using the service role key, which bypasses Row
 * Level Security entirely. Server-only, never imported by client
 * components (`server-only` import above enforces this at build time).
 * This is the ONLY client that may write to core trading tables —
 * strategy_signals, consensus_signals, final_signals, paper_trades,
 * risk_events, system_logs — mirroring the RLS policy in the schema
 * migration (authenticated: read-only, service_role: read/write).
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase project credentials.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
