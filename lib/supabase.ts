import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Singleton browser client — safe to import in any client component
export const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
