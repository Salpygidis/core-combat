import { io } from 'socket.io-client';

function client() {
  const socket = io('http://127.0.0.1:3001', { transports: ['websocket'] });
  socket.latest = null;
  socket.waiters = [];
  socket.on('state', (state) => {
    socket.latest = state;
    socket.waiters = socket.waiters.filter((w) => {
      if (w.pred(state)) {
        w.resolve(state);
        return false;
      }
      return true;
    });
  });
  socket.on('errorMessage', (msg) => {
    console.error('server error:', msg);
  });
  return socket;
}

function wait(socket, pred, label) {
  if (socket.latest && pred(socket.latest)) return Promise.resolve(socket.latest);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${label}`)), 5000);
    socket.waiters.push({
      pred,
      resolve: (s) => {
        clearTimeout(t);
        resolve(s);
      },
    });
  });
}

function joined(socket) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout joined')), 4000);
    socket.once('joined', (info) => {
      clearTimeout(t);
      resolve(info);
    });
  });
}

const a = client();
const b = client();
const spec = client();

try {
  a.emit('createRoom', { name: 'Host' });
  const joinedA = await joined(a);
  const code = joinedA.code;
  if (joinedA.role !== 'A') throw new Error('host should be A');

  b.emit('joinRoom', { code, name: 'Challenger' });
  const joinedB = await joined(b);
  if (joinedB.role !== 'B') throw new Error('joiner should be B');

  spec.emit('spectate', { code });
  const joinedS = await joined(spec);
  if (joinedS.role !== 'spectator') throw new Error('spec role');

  a.emit('intent', { type: 'startMatch' });
  const core = await wait(a, (s) => s.phase === 'core_select', 'core_select');
  if (core.hand.length !== 8) throw new Error('expected 8-card hand');

  a.emit('intent', { type: 'selectCore', cardId: 'strike-3' });
  a.emit('intent', { type: 'lockCore' });
  b.emit('intent', { type: 'selectCore', cardId: 'guard-1' });
  b.emit('intent', { type: 'lockCore' });

  const round = await wait(a, (s) => s.phase === 'round_select', 'round_select');
  if (round.players.A.cores[0].id !== 'strike-3') throw new Error('core A not revealed');
  if (round.hand.length !== 7) throw new Error('hand should be 7');

  a.emit('intent', { type: 'selectCard', cardId: 'strike-2' });
  a.emit('intent', { type: 'lockCard' });
  const mid = await wait(
    b,
    (s) => s.players.A.played[0] && s.players.A.played[0].hidden,
    'hidden lock',
  );
  if (mid.players.A.played[0].id !== 'hidden') throw new Error('opponent should not see locked card');

  b.emit('intent', { type: 'selectCard', cardId: 'powerup-2' });
  b.emit('intent', { type: 'lockCard' });
  const revealed = await wait(
    a,
    (s) => s.players.B.played[0] && !s.players.B.played[0].hidden,
    'reveal',
  );
  if (revealed.players.B.played[0].countered !== true) throw new Error('Strike should counter Power Up');
  if (revealed.players.B.cores[0].countered !== true) throw new Error('Strike 2 should auto-counter the only core');

  const specState = await wait(
    spec,
    (s) => s.phase === 'round_select' && s.round === 2,
    'spec round 2',
  );
  if (specState.hand.length !== 0) throw new Error('spectator must not get a hand');
  if (specState.spectatorCount < 1) throw new Error('spectator count');

  console.log('SMOKE OK', code, 'round', specState.round, 'spec', specState.spectatorCount);
  process.exit(0);
} catch (err) {
  console.error('SMOKE FAIL', err);
  process.exit(1);
} finally {
  a.close();
  b.close();
  spec.close();
}
