import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy init — avoids "supabaseUrl is required" during Next.js static analysis
let _admin: SupabaseClient | null = null;
let _browser: SupabaseClient | null = null;

export const getSupabaseAdmin = (): SupabaseClient => {
  if (!_admin) {
    _admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _admin;
};

export const getSupabase = (): SupabaseClient => {
  if (!_browser) {
    _browser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _browser;
};

// Keep backward-compat aliases used by API routes
// (these are getters, not eagerly-initialized values)
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get: (_, prop) => (getSupabaseAdmin() as any)[prop],
});
export const supabase = new Proxy({} as SupabaseClient, {
  get: (_, prop) => (getSupabase() as any)[prop],
});
