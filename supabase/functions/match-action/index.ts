import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { MatchEngine } from "https://raw.githubusercontent.com/isopropilen462-del/worm-grin/c9262e7/supabase/functions/match-action/engine.js";

interface InputLike {
  left: boolean;
  right: boolean;
  jump: boolean;
  jumpPressed: boolean;
  fire: boolean;
  firePressed: boolean;
  fireReleased: boolean;
  aimUp: boolean;
  aimDown: boolean;
  weaponSelect: number | null;
  pointerActive: boolean;
  pointerX: number;
  pointerY: number;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const emptyInput = (): InputLike => ({
  left: false, right: false, jump: false, jumpPressed: false,
  fire: false, firePressed: false, fireReleased: false,
  aimUp: false, aimDown: false, weaponSelect: null,
  pointerActive: false, pointerX: 0, pointerY: 0,
});

function toInput(value: unknown): InputLike {
  const raw = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const events = Array.isArray(raw.events) ? raw.events : [];
  const flag = (key: string) => raw[key] === true;
  const number = (key: string) => typeof raw[key] === "number" && Number.isFinite(raw[key]) ? raw[key] as number : 0;
  const weaponEvent = events.find(
    (event): event is { type: "weapon"; weapon: number } =>
      typeof event === "object" && event !== null &&
      (event as Record<string, unknown>).type === "weapon" &&
      typeof (event as Record<string, unknown>).weapon === "number",
  );
  return {
    ...emptyInput(),
    left: flag("left"), right: flag("right"), jump: flag("jump"),
    jumpPressed: events.some((event) => (event as { type?: string }).type === "jump"),
    fire: flag("fire"),
    firePressed: events.some((event) => (event as { type?: string }).type === "fire-press"),
    fireReleased: events.some((event) => (event as { type?: string }).type === "fire-release"),
    aimUp: flag("aimUp"), aimDown: flag("aimDown"),
    weaponSelect: weaponEvent && weaponEvent.weapon >= 1 && weaponEvent.weapon <= 6
      ? weaponEvent.weapon
      : null,
    pointerActive: flag("pointerActive"),
    pointerX: Math.max(0, Math.min(1600, number("pointerX"))),
    pointerY: Math.max(0, Math.min(720, number("pointerY"))),
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const roomCode = typeof body.roomCode === "string" ? body.roomCode.toUpperCase() : "";
    const playerId = typeof body.playerId === "string" ? body.playerId : "";
    const sequence = Number.isSafeInteger(body.sequence) ? body.sequence : 0;
    const elapsedMs =
      typeof body.elapsedMs === "number" && Number.isFinite(body.elapsedMs)
        ? Math.max(33, Math.min(250, body.elapsedMs))
        : 100;
    if (!roomCode || !playerId || sequence < 1) {
      return new Response(JSON.stringify({ error: "Invalid match command" }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, host_id, guest_id, seed, status, match_state, state_version")
      .eq("code", roomCode)
      .single();
    if (roomError || !room) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: corsHeaders });
    }

    const seat = room.host_id === playerId ? 0 : room.guest_id === playerId ? 1 : null;
    if (seat === null) {
      return new Response(JSON.stringify({ error: "Player is not part of this room" }), { status: 403, headers: corsHeaders });
    }

    const existing = await supabase
      .from("match_inputs")
      .select("id")
      .eq("room_id", room.id)
      .eq("player_id", playerId)
      .eq("seq", sequence)
      .maybeSingle();
    if (existing.data) {
      return new Response(JSON.stringify({ state: room.match_state, duplicate: true }), { headers: corsHeaders });
    }

    const engine = new MatchEngine(Number(room.seed), room.match_state ?? undefined);
    const before = engine.snapshot();
    if (before.teamIndex !== seat) {
      return new Response(JSON.stringify({ state: before, waiting: true }), { status: 409, headers: corsHeaders });
    }

    const input = toInput(body.input);
    engine.step(input, elapsedMs / 1000);
    const state = engine.snapshot();

    const { error: commandError } = await supabase.from("match_inputs").insert({
      room_id: room.id,
      player_id: playerId,
      seq: sequence,
      payload: body.input ?? {},
    });
    if (commandError) throw commandError;

    const { error: updateError } = await supabase.from("rooms").update({
      match_state: state,
      state_version: Number(room.state_version) + 1,
      last_action_at: new Date().toISOString(),
      status: state.winner ? "finished" : "playing",
      winner: state.winner,
    }).eq("id", room.id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ state }), { headers: corsHeaders });
  } catch (error) {
    console.error("match-action failed", error);
    return new Response(JSON.stringify({ error: "Unable to process match command" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
