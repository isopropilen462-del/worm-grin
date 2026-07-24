import type { BackgroundId } from '../game/Background';
import type { Winner } from '../game/constants';
import { randomSeed } from '../game/rng';
import { getPlayerId, getSupabase } from './supabase';
import type { RoomRow } from './types';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!;
  }
  return code;
}

export function asSeed(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return randomSeed();
  return n >>> 0;
}

function formatError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: unknown }).message || fallback);
    const details =
      'details' in error && (error as { details?: unknown }).details
        ? ` (${String((error as { details: unknown }).details)})`
        : '';
    return new Error(`${msg}${details}`);
  }
  return new Error(fallback);
}

export async function createRoom(backgroundId: BackgroundId): Promise<RoomRow> {
  const sb = getSupabase();
  const hostId = getPlayerId();
  const code = generateRoomCode();
  const seed = randomSeed();

  const { data, error } = await sb
    .from('rooms')
    .insert({
      code,
      host_id: hostId,
      status: 'waiting',
      seed,
      background_id: backgroundId,
    })
    .select()
    .single();

  if (error) throw formatError(error, 'Не удалось создать комнату');
  const row = data as RoomRow;
  return { ...row, seed: asSeed(row.seed) };
}

export async function joinRoom(code: string): Promise<RoomRow> {
  const sb = getSupabase();
  const guestId = getPlayerId();
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (normalized.length < 4) {
    throw new Error('Введите код комнаты (6 символов)');
  }

  const { data: room, error: findError } = await sb
    .from('rooms')
    .select('*')
    .eq('code', normalized)
    .maybeSingle();

  if (findError) throw formatError(findError, 'Не удалось найти комнату');
  if (!room) throw new Error('Комната не найдена. Проверьте код.');

  // Same browser/tab rejoining own room — treat as host wait, not an error for callers.
  if (room.host_id === guestId) {
    if (room.guest_id) {
      return { ...(room as RoomRow), seed: asSeed(room.seed) };
    }
    throw new Error('Это ваша комната — дождитесь соперника или откройте ссылку в другом браузере/устройстве.');
  }

  if (room.status === 'finished') {
    throw new Error('Матч уже завершён');
  }

  if (room.guest_id && room.guest_id !== guestId) {
    throw new Error('Комната уже занята');
  }

  // Already joined earlier (refresh / second click)
  if (room.guest_id === guestId) {
    return { ...(room as RoomRow), seed: asSeed(room.seed) };
  }

  if (room.status !== 'waiting') {
    throw new Error('Матч уже начался');
  }

  const { data, error } = await sb
    .from('rooms')
    .update({
      guest_id: guestId,
      status: 'playing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', room.id)
    .eq('status', 'waiting')
    .is('guest_id', null)
    .select()
    .maybeSingle();

  if (error) throw formatError(error, 'Не удалось войти в комнату');
  if (!data) {
    // Lost the race — re-fetch
    const latest = await fetchRoom(normalized);
    if (latest?.guest_id === guestId) return latest;
    throw new Error('Комната уже занята');
  }

  return { ...(data as RoomRow), seed: asSeed((data as RoomRow).seed) };
}

export async function fetchRoom(code: string): Promise<RoomRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('rooms')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw formatError(error, 'Не удалось загрузить комнату');
  if (!data) return null;
  const row = data as RoomRow;
  return { ...row, seed: asSeed(row.seed) };
}

export async function markRoomPlaying(
  roomId: string,
  backgroundId: BackgroundId,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from('rooms')
    .update({
      status: 'playing',
      background_id: backgroundId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId);
  if (error) throw formatError(error, 'Не удалось обновить комнату');
}

export async function finishRoom(roomId: string, winner: Winner): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from('rooms')
    .update({
      status: 'finished',
      winner,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId);
  if (error) throw formatError(error, 'Не удалось завершить комнату');
}
