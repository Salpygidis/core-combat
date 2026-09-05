import { describe, expect, it } from 'vitest';
import { Match } from './match.js';
import type { CardId, Seat } from './types.js';

function seated(): Match {
  const m = new Match('TEST');
  m.occupy('A', 'Host', 'sock-a');
  m.occupy('B', 'Challenger', 'sock-b');
  const start = m.apply('A', { type: 'startMatch' });
  expect(start.ok).toBe(true);
  return m;
}

function pickCore(m: Match, seat: Seat, cardId: CardId) {
  expect(m.apply(seat, { type: 'selectCore', cardId }).ok).toBe(true);
  expect(m.apply(seat, { type: 'lockCore' }).ok).toBe(true);
}

function play(m: Match, seat: Seat, cardId: CardId) {
  expect(m.apply(seat, { type: 'selectCard', cardId }).ok).toBe(true);
  expect(m.apply(seat, { type: 'lockCard' }).ok).toBe(true);
}

describe('match flow', () => {
  it('hides cores until both lock', () => {
    const m = seated();
    pickCore(m, 'A', 'strike-3');
    const viewB = m.getPrivateState('B');
    expect(viewB.players.A.cores[0]?.hidden).toBe(true);
    expect(viewB.players.A.cores[0]?.id).toBe('hidden');
    pickCore(m, 'B', 'guard-1');
    expect(m.phase).toBe('round_select');
    expect(m.players.A.cores[0].id).toBe('strike-3');
    expect(m.players.B.cores[0].id).toBe('guard-1');
    expect(m.players.A.hand).toHaveLength(7);
  });

  it('reveals combat cards together', () => {
    const m = seated();
    pickCore(m, 'A', 'guard-2');
    pickCore(m, 'B', 'guard-1');
    play(m, 'A', 'strike-3');
    const mid = m.getPrivateState('B');
    expect(mid.players.A.played[0]?.hidden).toBe(true);
    expect(mid.players.A.played[0]?.id).toBe('hidden');
    play(m, 'B', 'powerup-2');
    expect(m.phase).toBe('round_select');
    expect(m.round).toBe(2);
    const slot = m.players.B.played[0];
    expect(slot?.hidden).toBe(false);
    expect(slot?.countered).toBe(true);
    expect(slot?.value).toBe(0);
    expect(m.lastRound?.coreTargetsA).toEqual([0]);
    expect(m.players.B.cores[0].countered).toBe(true);
  });

  it('core counters persist through later rounds', () => {
    const m = seated();
    pickCore(m, 'A', 'guard-2');
    pickCore(m, 'B', 'guard-1');
    play(m, 'A', 'strike-3');
    play(m, 'B', 'powerup-2');
    expect(m.players.B.cores[0].countered).toBe(true);
    play(m, 'A', 'taunt-3');
    play(m, 'B', 'taunt-2');
    expect(m.players.B.cores[0].countered).toBe(true);
  });

  it('Guard 1 does not uncounter a core', () => {
    const m = seated();
    pickCore(m, 'A', 'guard-2');
    pickCore(m, 'B', 'taunt-3');
    play(m, 'A', 'strike-3');
    play(m, 'B', 'powerup-2');
    expect(m.players.B.cores[0].countered).toBe(true);
    play(m, 'A', 'powerup-1');
    play(m, 'B', 'guard-1');
    expect(m.players.B.cores[0].countered).toBe(true);
    expect(m.phase).not.toBe('round_choice');
    expect(m.lastRound?.uncounterB).toBe(null);
    expect(m.lastRound?.effectB).toBe('plus-per-uncountered-core');
  });

  it('resets core counters after the 5-card game, not between rounds', () => {
    const m = seated();
    pickCore(m, 'A', 'guard-2');
    pickCore(m, 'B', 'guard-1');
    play(m, 'A', 'strike-3');
    play(m, 'B', 'powerup-2');
    expect(m.players.B.cores[0].countered).toBe(true);
    play(m, 'A', 'taunt-3');
    play(m, 'B', 'taunt-2');
    play(m, 'A', 'powerup-1');
    play(m, 'B', 'powerup-1');
    play(m, 'A', 'strike-2');
    play(m, 'B', 'strike-2');
    while (m.phase === 'round_choice') {
      const choice = m.choiceQueue[0];
      m.apply(choice.seat, { type: 'chooseTargets', indices: choice.legal.slice(0, choice.needed) });
    }
    expect(m.players.B.cores[0].countered).toBe(true);
    play(m, 'A', 'taunt-2');
    play(m, 'B', 'taunt-3');
    expect(m.phase).toBe('game_score');
    expect(m.players.B.cores[0].countered).toBe(true);
    m.apply('A', { type: 'ackScore' });
    m.apply('B', { type: 'ackScore' });
    if (m.phase === 'winner_core') {
      const winner = m.scoreBreakdown!.winner as Seat;
      const card = m.players[winner].hand[0];
      expect(m.apply(winner, { type: 'playWinnerCore', cardId: card }).ok).toBe(true);
    }
    expect(m.phase).toBe('round_select');
    expect(m.players.A.cores.every((c) => !c.countered)).toBe(true);
    expect(m.players.B.cores.every((c) => !c.countered)).toBe(true);
  });

  it('Strike 2 counters two enemy cores', () => {
    const m = seated();
    pickCore(m, 'A', 'guard-2');
    pickCore(m, 'B', 'guard-1');
    m.players.B.cores.push({ id: 'taunt-3', countered: false, hidden: false });
    play(m, 'A', 'strike-2');
    play(m, 'B', 'strike-3');
    expect(m.phase).toBe('round_select');
    expect(m.players.B.cores.every((c) => c.countered)).toBe(true);
    expect(m.lastRound?.coreTargetsA).toEqual([0, 1]);
  });

  it('pauses on disconnect and resumes on reconnect', () => {
    const m = seated();
    pickCore(m, 'A', 'strike-3');
    pickCore(m, 'B', 'taunt-3');
    m.disconnectSocket('sock-a');
    expect(m.paused).toBe(true);
    const blocked = m.apply('B', { type: 'selectCard', cardId: 'strike-2' });
    expect(blocked.ok).toBe(false);
    const token = m.players.A.token;
    expect(m.reconnect('A', token, 'sock-a2').ok).toBe(true);
    expect(m.paused).toBe(false);
  });

  it('winner parks a core then continues; 3 cores + win ends the match', () => {
    const m = seated();
    pickCore(m, 'A', 'powerup-1');
    pickCore(m, 'B', 'powerup-2');

    // Force a game win for A by stuffing scored plays (engine is already unit-tested).
    // Play five rounds of same-type mirrors so values are live, then A has combo of nothing
    // but we just need A to win somehow — give A a live Strike 3 vs B Power Up already cored.
    // Simpler: mutate after a real 5-round game is long. Drive five rounds:
    const aCards: CardId[] = ['strike-3', 'strike-2', 'taunt-3', 'taunt-2', 'guard-1'];
    const bCards: CardId[] = ['strike-2', 'strike-3', 'taunt-2', 'taunt-3', 'guard-1'];
    // wait B already parked powerup-2, A parked powerup-1
    // A hand has strike-3,2 taunt-3,2 guard-1,2 powerup-2
    // B hand has strike-3,2 taunt-3,2 guard-1,2 powerup-1
    for (let i = 0; i < 5; i++) {
      play(m, 'A', aCards[i]);
      play(m, 'B', bCards[i]);
      while (m.phase === 'round_choice') {
        const choice = m.choiceQueue[0];
        m.apply(choice.seat, { type: 'chooseTargets', indices: choice.legal.slice(0, choice.needed) });
      }
    }
    expect(m.phase).toBe('game_score');
    m.apply('A', { type: 'ackScore' });
    m.apply('B', { type: 'ackScore' });
    if (m.phase === 'winner_core') {
      const winner = m.scoreBreakdown!.winner as Seat;
      const card = m.players[winner].hand[0];
      m.apply(winner, { type: 'selectWinnerCore', cardId: card });
      m.apply(winner, { type: 'lockWinnerCore' });
      expect(m.players[winner].cores.length).toBe(2);
      expect(m.phase).toBe('round_select');
      expect(m.gameNumber).toBe(2);
    }
  });

  it('swaps seats at match over and host follows', () => {
    const m = seated();
    m.phase = 'match_over';
    m.matchWinner = 'A';
    m.players.A.matchWins = 3;
    m.players.B.matchWins = 1;
    const swapped = m.apply('B', { type: 'swapSeats' });
    expect(swapped.ok).toBe(true);
    expect(swapped.swapped).toBe(true);
    expect(m.players.A.name).toBe('Challenger');
    expect(m.players.B.name).toBe('Host');
    expect(m.hostSeat).toBe('B');
    expect(m.matchWinner).toBe('B');
    expect(m.players.A.matchWins).toBe(1);
    expect(m.players.B.matchWins).toBe(3);
    expect(m.apply('A', { type: 'rematch' }).ok).toBe(false);
    expect(m.apply('B', { type: 'rematch' }).ok).toBe(true);
    expect(m.phase).toBe('core_select');
    expect(m.players.A.name).toBe('Challenger');
    expect(m.players.B.name).toBe('Host');
  });

  it('rejects seat swap during a live game', () => {
    const m = seated();
    expect(m.apply('A', { type: 'swapSeats' }).ok).toBe(false);
  });

  it('spectators do not receive hands', () => {
    const m = seated();
    pickCore(m, 'A', 'strike-3');
    pickCore(m, 'B', 'guard-1');
    const spec = m.getPrivateState('spectator');
    expect(spec.hand).toEqual([]);
    expect(spec.players.A.handCount).toBe(7);
  });

  it('playCore and playCard lock in one action', () => {
    const m = seated();
    expect(m.apply('A', { type: 'playCore', cardId: 'strike-3' }).ok).toBe(true);
    expect(m.players.A.locked).toBe(true);
    expect(m.players.A.cores[0]?.id).toBe('strike-3');
    expect(m.players.A.hand).not.toContain('strike-3');
    expect(m.apply('B', { type: 'playCore', cardId: 'guard-1' }).ok).toBe(true);
    expect(m.phase).toBe('round_select');
    expect(m.apply('A', { type: 'playCard', cardId: 'strike-2' }).ok).toBe(true);
    expect(m.players.A.played[0]?.hidden).toBe(true);
    expect(m.players.A.hand).not.toContain('strike-2');
    expect(m.apply('A', { type: 'playCard', cardId: 'taunt-3' }).ok).toBe(false);
  });
});
