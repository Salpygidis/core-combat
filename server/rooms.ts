import { Match } from '../shared/match.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export interface Room {
  code: string;
  match: Match;
  spectators: Set<string>;
}

const rooms = new Map<string, Room>();

export function createRoom(): Room {
  let code = makeRoomCode();
  while (rooms.has(code)) code = makeRoomCode();
  const match = new Match(code);
  const room: Room = { code, match, spectators: new Set() };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.trim().toUpperCase());
}

export function dropEmpty(room: Room): void {
  const playersPresent = room.match.players.A.present || room.match.players.B.present;
  const anyoneConnected =
    room.match.players.A.connected ||
    room.match.players.B.connected ||
    room.spectators.size > 0;
  if (!playersPresent && !anyoneConnected) {
    rooms.delete(room.code);
  }
}

export function specRoom(code: string): string {
  return `spec:${code}`;
}
