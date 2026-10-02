import { supabase } from '@/lib/supabase/client'

// Typed Postgrest client helper to bypass 'never' table index when types.ts is empty
export const db = supabase as any
