import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. Uses only the public URL + anon key, both
 * safe to expose. Reads (per RLS policies in
 * `supabase/migrations/0001_init_schema.sql`) are the only thing this
 * client is ever used for — writes to core trading tables go through
 * server-side code using the service role key (see `server.ts`).
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase project credentials.",
    );
  }

  return createBrowserClient(url, anonKey);
}
