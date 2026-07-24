import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import type { GameSnapshot, InputSnapshot, MatchStartPayload, OnlineRole } from './types';

type Handler<T> = (payload: T) => void;

export class NetSession {
  readonly role: OnlineRole;
  readonly roomCode: string;
  readonly roomId: string;
  private channel: RealtimeChannel;
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

  async sendInput(input: InputSnapshot): Promise<void> {
    if (this.destroyed) return;
    await this.channel.send({
      type: 'broadcast',
      event: 'input',
      payload: input,
    });
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
    await getSupabase().removeChannel(this.channel);
  }
}
