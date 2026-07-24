import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function isOnlineConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error('Supabase env vars missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

const PLAYER_KEY = 'worm-grin-player-id';

/** Per-tab id so two tabs in one browser can play against each other. */
export function getPlayerId(): string {
  try {
    const existing = sessionStorage.getItem(PLAYER_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(PLAYER_KEY, id);
    return id;
  } catch {
    return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
