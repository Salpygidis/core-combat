import type { Server, Socket } from 'socket.io';
import type { Intent, Seat } from '../shared/types.js';
import { SEATS } from '../shared/types.js';
import { createRoom, dropEmpty, getRoom, specRoom, type Room } from './rooms.js';

interface Session {
  code: string;
  role: Seat | 'spectator';
}

const sessions = new Map<string, Session>();

function bind(socket: Socket, room: Room, role: Seat | 'spectator'): void {
  const prev = sessions.get(socket.id);
  if (prev) socket.leave(specRoom(prev.code));
  sessions.set(socket.id, { code: room.code, role });
  socket.join(room.code);
  if (role === 'spectator') {
    room.spectators.add(socket.id);
    socket.join(specRoom(room.code));
  }
  room.match.spectatorCount = room.spectators.size;
}

function rebindSeats(io: Server, room: Room): void {
  for (const seat of SEATS) {
    const p = room.match.players[seat];
    if (!p.socketId) continue;
    sessions.set(p.socketId, { code: room.code, role: seat });
    io.to(p.socketId).emit('joined', {
      code: room.code,
      role: seat,
      token: p.token,
      host: seat === room.match.hostSeat,
    });
  }
}

function broadcast(io: Server, room: Room): void {
  room.match.spectatorCount = room.spectators.size;
  for (const seat of SEATS) {
    const p = room.match.players[seat];
    if (p.socketId) {
      io.to(p.socketId).emit('state', room.match.getPrivateState(seat));
    }
  }
  io.to(specRoom(room.code)).emit('state', room.match.getPrivateState('spectator'));
}

export function attachSockets(io: Server): void {
  io.on('connection', (socket) => {
    socket.on('createRoom', (payload: { name?: string } = {}) => {
      const room = createRoom();
      const result = room.match.occupy('A', payload.name, socket.id);
      if ('error' in result) {
        socket.emit('errorMessage', result.error);
        return;
      }
      bind(socket, room, 'A');
      socket.emit('joined', {
        code: room.code,
        role: 'A' as const,
        token: result.token,
        host: true,
      });
      broadcast(io, room);
    });

    socket.on('joinRoom', (payload: { code?: string; name?: string } = {}) => {
      const room = payload.code ? getRoom(payload.code) : undefined;
      if (!room) {
        socket.emit('errorMessage', 'No room with that code');
        return;
      }
      const empty = SEATS.find((s) => !room.match.players[s].present);
      if (!empty) {
        socket.emit('errorMessage', 'Both seats are taken — join as spectator');
        return;
      }
      const result = room.match.occupy(empty, payload.name, socket.id);
      if ('error' in result) {
        socket.emit('errorMessage', result.error);
        return;
      }
      bind(socket, room, empty);
      socket.emit('joined', {
        code: room.code,
        role: empty,
        token: result.token,
        host: empty === room.match.hostSeat,
      });
      broadcast(io, room);
    });

    socket.on('spectate', (payload: { code?: string } = {}) => {
      const room = payload.code ? getRoom(payload.code) : undefined;
      if (!room) {
        socket.emit('errorMessage', 'No room with that code');
        return;
      }
      bind(socket, room, 'spectator');
      socket.emit('joined', {
        code: room.code,
        role: 'spectator' as const,
        token: null,
        host: false,
      });
      broadcast(io, room);
    });

    socket.on('reconnectSeat', (payload: { code?: string; seat?: Seat; token?: string } = {}) => {
      const room = payload.code ? getRoom(payload.code) : undefined;
      if (!room || !payload.seat || !payload.token) {
        socket.emit('errorMessage', 'Reconnect failed');
        return;
      }
      const result = room.match.reconnect(payload.seat, payload.token, socket.id);
      if (!result.ok) {
        socket.emit('errorMessage', result.error ?? 'Reconnect failed');
        return;
      }
      bind(socket, room, payload.seat);
      socket.emit('joined', {
        code: room.code,
        role: payload.seat,
        token: payload.token,
        host: payload.seat === room.match.hostSeat,
      });
      broadcast(io, room);
    });

    socket.on('intent', (intent: Intent) => {
      const session = sessions.get(socket.id);
      if (!session || session.role === 'spectator') {
        socket.emit('errorMessage', 'Spectators cannot act');
        return;
      }
      const room = getRoom(session.code);
      if (!room) {
        socket.emit('errorMessage', 'Room is gone');
        return;
      }
      const result = room.match.apply(session.role, intent);
      if (!result.ok) {
        socket.emit('errorMessage', result.error ?? 'Illegal action');
        return;
      }
      if (result.swapped) rebindSeats(io, room);
      broadcast(io, room);
    });

    socket.on('disconnect', () => {
      const session = sessions.get(socket.id);
      sessions.delete(socket.id);
      if (!session) return;
      const room = getRoom(session.code);
      if (!room) return;
      if (session.role === 'spectator') {
        room.spectators.delete(socket.id);
      } else {
        room.match.disconnectSocket(socket.id);
      }
      room.match.spectatorCount = room.spectators.size;
      broadcast(io, room);
      dropEmpty(room);
    });
  });
}
