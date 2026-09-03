import { createServer } from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';
import { attachSockets } from './sockets.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5173);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
});

attachSockets(io);

const dist = path.join(process.cwd(), 'dist');
if (existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/health', (_req, res) => res.json({ ok: true }));
}

httpServer.listen(PORT, () => {
  const built = existsSync(path.join(dist, 'index.html'));
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  CORE COMBAT');
  console.log('══════════════════════════════════════════');
  if (built) {
    console.log(`  Open: http://localhost:${PORT}`);
  } else {
    console.log(`  Open: http://localhost:${CLIENT_PORT}`);
    console.log(`  Server (socket): http://localhost:${PORT}`);
  }
  console.log('');
  console.log('  Player 2: open a second tab → Join room → enter the code');
  console.log('  Spectator: third tab → Join as spectator → same code');
  console.log('  Solo: Local hotseat (debug) on the home screen');
  console.log('══════════════════════════════════════════');
  console.log('');
});
