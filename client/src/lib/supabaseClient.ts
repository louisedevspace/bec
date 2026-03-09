import { createClient } from '@supabase/supabase-js';

const rawSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

const supabaseUrl = rawSupabaseUrl
	? (/^https?:\/\//i.test(rawSupabaseUrl) ? rawSupabaseUrl : `https://${rawSupabaseUrl}`)
	: '';

if (!supabaseUrl || !supabaseAnonKey) {
	console.error('Supabase client is missing required env vars:', {
		hasUrl: !!supabaseUrl,
		hasAnonKey: !!supabaseAnonKey,
	});
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
	},
});