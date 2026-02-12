import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (_client) return _client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Return a minimal stub during build / when env is not configured.
    // All methods will throw at runtime if actually called.
    return new Proxy({} as SupabaseClient, {
      get(_target, prop) {
        if (prop === "auth") {
          return {
            signInWithPassword: async () => ({
              data: { user: null, session: null },
              error: new Error("Supabase not configured"),
            }),
            signOut: async () => ({ error: null }),
            getUser: async () => ({ data: { user: null }, error: null }),
            onAuthStateChange: () => ({
              data: { subscription: { unsubscribe: () => {} } },
            }),
          };
        }
        return () => {};
      },
    });
  }

  _client = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return _client;
}
