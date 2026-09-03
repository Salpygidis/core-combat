import { io, type Socket } from 'socket.io-client';
import type { Intent, PrivateMatchState, Seat } from '@shared/types';

export interface Joined {
  code: string;
  role: Seat | 'spectator';
  token: string | null;
  host: boolean;
}

export type NetHandlers = {
  onJoined(info: Joined): void;
  onState(state: PrivateMatchState): void;
  onError(message: string): void;
};

export function connectNet(handlers: NetHandlers): {
  socket: Socket;
  createRoom(name: string): void;
  joinRoom(code: string, name: string): void;
  spectate(code: string): void;
  reconnect(code: string, seat: Seat, token: string): void;
  send(intent: Intent): void;
} {
  const socket = io({
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socket.on('joined', (info: Joined) => handlers.onJoined(info));
  socket.on('state', (state: PrivateMatchState) => handlers.onState(state));
  socket.on('errorMessage', (message: string) => handlers.onError(message));
  socket.on('connect_error', () => handlers.onError('Cannot reach the game server'));

  return {
    socket,
    createRoom: (name) => socket.emit('createRoom', { name }),
    joinRoom: (code, name) => socket.emit('joinRoom', { code: code.trim().toUpperCase(), name }),
    spectate: (code) => socket.emit('spectate', { code: code.trim().toUpperCase() }),
    reconnect: (code, seat, token) => socket.emit('reconnectSeat', { code, seat, token }),
    send: (intent) => socket.emit('intent', intent),
  };
}

const STORE = 'core-combat-session';

export function saveSession(code: string, seat: Seat, token: string): void {
  sessionStorage.setItem(STORE, JSON.stringify({ code, seat, token }));
}

export function loadSession(): { code: string; seat: Seat; token: string } | null {
  try {
    const raw = sessionStorage.getItem(STORE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(STORE);
}
