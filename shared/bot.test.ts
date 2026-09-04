import { describe, expect, it } from 'vitest';
import { botIntent } from './bot.js';
import { Match } from './match.js';

function vsBot(): Match {
  const m = new Match('BOT');
  m.occupy('A', 'You', 'a');
  m.occupy('B', 'Cambria AI', 'b');
  expect(m.apply('A', { type: 'startMatch' }).ok).toBe(true);
  return m;
}

function drive(match: Match, max = 400): void {
  for (let i = 0; i < max; i++) {
    if (match.phase === 'match_over') return;
    const waiting = match.waitingSeats();
    if (!waiting.length) {
      throw new Error(`stuck in ${match.phase}`);
    }
    const seat = waiting[0];
    const intent = botIntent(match, seat);
    if (!intent) throw new Error(`no intent for ${seat} in ${match.phase}`);
    const result = match.apply(seat, intent);
    if (!result.ok) throw new Error(`${seat} ${intent.type}: ${result.error}`);
  }
  throw new Error(`did not finish after ${max} steps (${match.phase})`);
}

describe('bot', () => {
  it('selects a core from its hand', () => {
    const m = vsBot();
    const intent = botIntent(m, 'B');
    expect(intent?.type).toBe('selectCore');
    if (intent?.type !== 'selectCore') return;
    expect(m.players.B.hand).toContain(intent.cardId);
    expect(m.apply('B', intent).ok).toBe(true);
    expect(botIntent(m, 'B')?.type).toBe('lockCore');
  });

  it('plays a full match against itself without illegal moves', () => {
    const m = vsBot();
    drive(m);
    expect(m.phase).toBe('match_over');
    expect(m.matchWinner === 'A' || m.matchWinner === 'B').toBe(true);
    expect(m.players[m.matchWinner!].cores.length).toBeGreaterThanOrEqual(3);
  });

  it('picks legal targets when a Strike resolves', () => {
    const m = vsBot();
    drive(m);
    expect(m.phase).toBe('match_over');
  });
});
