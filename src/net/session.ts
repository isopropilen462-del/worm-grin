import type { RealtimeChannel } from '@supabase/supabase-js';
import { getPlayerId, getSupabase } from './supabase';
import type { GameSnapshot, InputSnapshot, MatchStartPayload, OnlineRole } from './types';

type Handler<T> = (payload: T) => void;

function gameServerUrl(): string {
  const configured = import.meta.env.VITE_GAME_SERVER_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '');
  // Local default used by `npm run server`.
  return 'http://127.0.0.1:8787';
}

function gameServerWsUrl(): string {
  const http = gameServerUrl();
  if (http.startsWith('https://')) return `wss://${http.slice('https://'.length)}`;
  if (http.startsWith('http://')) return `ws://${http.slice('http://'.length)}`;
  return http;
}

/**
 * Online transport: Supabase Realtime for lobby peer/start signals, plus a
 * persistent WebSocket match server that owns the simulation.
 */
export class NetSession {
  readonly role: OnlineRole;
  readonly roomCode: string;
  readonly roomId: string;
  private channel: RealtimeChannel;
  private matchSocket: WebSocket | null = null;
  private onInputHandlers: Handler<InputSnapshot>[] = [];
  private onStateHandlers: Handler<GameSnapshot>[] = [];
  private onStartHandlers: Handler<MatchStartPayload>[] = [];
  private onPeerHandlers: Handler<'joined' | 'left'>[] = [];
  private destroyed = false;

  private constructor(
    role: OnlineRole,
    roomCode: string,
    roomId: string,
    channel: RealtimeChannel,
  ) {
    this.role = role;
    this.roomCode = roomCode;
    this.roomId = roomId;
    this.channel = channel;
  }

  static async connect(
    role: OnlineRole,
    roomCode: string,
    roomId: string,
  ): Promise<NetSession> {
    const sb = getSupabase();
    const channel = sb.channel(`match:${roomCode}`, {
      config: { broadcast: { self: false } },
    });

    const session = new NetSession(role, roomCode, roomId, channel);

    channel
      .on('broadcast', { event: 'input' }, ({ payload }) => {
        session.onInputHandlers.forEach((h) => h(payload as InputSnapshot));
      })
      .on('broadcast', { event: 'state' }, ({ payload }) => {
        session.onStateHandlers.forEach((h) => h(payload as GameSnapshot));
      })
      .on('broadcast', { event: 'start' }, ({ payload }) => {
        session.onStartHandlers.forEach((h) => h(payload as MatchStartPayload));
      })
      .on('broadcast', { event: 'peer' }, ({ payload }) => {
        const kind = (payload as { kind: 'joined' | 'left' }).kind;
        session.onPeerHandlers.forEach((h) => h(kind));
      });

    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`Realtime channel failed: ${status}`));
        }
      });
    });

    return session;
  }

  get seat(): 0 | 1 {
    return this.role === 'host' ? 0 : 1;
  }

  onInput(handler: Handler<InputSnapshot>): () => void {
    this.onInputHandlers.push(handler);
    return () => {
      this.onInputHandlers = this.onInputHandlers.filter((h) => h !== handler);
    };
  }

  onState(handler: Handler<GameSnapshot>): () => void {
    this.onStateHandlers.push(handler);
    return () => {
      this.onStateHandlers = this.onStateHandlers.filter((h) => h !== handler);
    };
  }

  onStart(handler: Handler<MatchStartPayload>): () => void {
    this.onStartHandlers.push(handler);
    return () => {
      this.onStartHandlers = this.onStartHandlers.filter((h) => h !== handler);
    };
  }

  onPeer(handler: Handler<'joined' | 'left'>): () => void {
    this.onPeerHandlers.push(handler);
    return () => {
      this.onPeerHandlers = this.onPeerHandlers.filter((h) => h !== handler);
    };
  }

  hasMatchServer(): boolean {
    return !!this.matchSocket && this.matchSocket.readyState === WebSocket.OPEN;
  }

  /** Open the persistent match-server socket that runs the simulation. */
  async connectMatchServer(seed: number): Promise<void> {
    if (this.destroyed) return;
    if (this.matchSocket && this.matchSocket.readyState === WebSocket.OPEN) return;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(gameServerWsUrl());
      this.matchSocket = ws;
      const timer = window.setTimeout(() => {
        reject(new Error('Match server connection timed out'));
        ws.close();
      }, 8000);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'hello',
            roomCode: this.roomCode,
            roomId: this.roomId,
            playerId: getPlayerId(),
            role: this.role,
            seed,
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as {
            type: string;
            state?: GameSnapshot;
            message?: string;
          };
          if (message.type === 'welcome') {
            window.clearTimeout(timer);
            resolve();
            return;
          }
          if (message.type === 'state' && message.state) {
            this.onStateHandlers.forEach((h) => h(message.state!));
            return;
          }
          if (message.type === 'error') {
            window.clearTimeout(timer);
            reject(new Error(message.message || 'Match server error'));
          }
        } catch {
          // Ignore malformed packets; the next state will resync.
        }
      };

      ws.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Match server unavailable'));
      };

      ws.onclose = () => {
        if (this.matchSocket === ws) this.matchSocket = null;
      };
    });
  }

  async sendInput(input: InputSnapshot): Promise<void> {
    if (this.destroyed) return;
    // Prefer the persistent match server; fall back to Realtime only for lobby.
    if (this.matchSocket && this.matchSocket.readyState === WebSocket.OPEN) {
      this.matchSocket.send(
        JSON.stringify({
          type: 'input',
          left: input.left,
          right: input.right,
          jump: input.jump,
          fire: input.fire,
          aimUp: input.aimUp,
          aimDown: input.aimDown,
          pointerActive: input.pointerActive,
          pointerX: input.pointerX,
          pointerY: input.pointerY,
          events: input.events,
        }),
      );
      return;
    }
    await this.channel.send({
      type: 'broadcast',
      event: 'input',
      payload: input,
    });
  }

  async sendAuthoritativeInput(input: InputSnapshot): Promise<GameSnapshot | null> {
    await this.sendInput(input);
    return null;
  }

  async fetchAuthoritativeState(): Promise<GameSnapshot | null> {
    return null;
  }

  async sendState(state: GameSnapshot): Promise<void> {
    if (this.destroyed) return;
    await this.channel.send({
      type: 'broadcast',
      event: 'state',
      payload: state,
    });
  }

  async sendStart(payload: MatchStartPayload): Promise<void> {
    if (this.destroyed) return;
    await this.channel.send({
      type: 'broadcast',
      event: 'start',
      payload,
    });
  }

  async notifyPeer(kind: 'joined' | 'left'): Promise<void> {
    if (this.destroyed) return;
    await this.channel.send({
      type: 'broadcast',
      event: 'peer',
      payload: { kind },
    });
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.onInputHandlers = [];
    this.onStateHandlers = [];
    this.onStartHandlers = [];
    this.onPeerHandlers = [];
    if (this.matchSocket) {
      this.matchSocket.close();
      this.matchSocket = null;
    }
    await getSupabase().removeChannel(this.channel);
  }
}

export function isMatchServerConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GAME_SERVER_URL);
}
