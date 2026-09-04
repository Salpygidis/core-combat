import { def, SEAT_FACTION } from './cards.js';
import { comboBonus, resolveRoundPreview, type CoreState } from './engine.js';
import { counters } from './counters.js';
import type { Match } from './match.js';
import type { CardId, ChoiceRequest, EffectId, Intent, PlayedSlot, Seat } from './types.js';
import { opponent } from './types.js';

const BOT_SEAT: Seat = 'B';

/** Next legal intent for the bot, or null if it should wait. */
export function botIntent(match: Match, seat: Seat = BOT_SEAT): Intent | null {
  const waiting = match.waitingSeats();
  if (!waiting.includes(seat)) return null;
  const p = match.players[seat];

  switch (match.phase) {
    case 'core_select':
      if (!p.selection) return { type: 'selectCore', cardId: pickCore(match, seat) };
      return { type: 'lockCore' };
    case 'round_select':
      if (!p.selection) return { type: 'selectCard', cardId: pickCombat(match, seat) };
      return { type: 'lockCard' };
    case 'round_choice': {
      const choice = match.choiceQueue[0];
      if (!choice || choice.seat !== seat) return null;
      return { type: 'chooseTargets', indices: pickTargets(match, seat, choice) };
    }
    case 'game_score':
      return { type: 'ackScore' };
    case 'winner_core': {
      if (match.scoreBreakdown?.winner !== seat) return null;
      if (!p.selection) return { type: 'selectWinnerCore', cardId: pickWinnerCore(match, seat) };
      return { type: 'lockWinnerCore' };
    }
    default:
      return null;
  }
}

export function pickCore(match: Match, seat: Seat): CardId {
  return best(match.players[seat].hand, (id) => coreScore(id));
}

export function pickWinnerCore(match: Match, seat: Seat): CardId {
  const coreIds = new Set(match.players[seat].cores.map((c) => c.id));
  const available = match.players[seat].hand.filter((id) => !coreIds.has(id));
  const pool = available.length ? available : match.players[seat].hand;
  return best(pool, (id) => coreScore(id));
}

export function pickCombat(match: Match, seat: Seat): CardId {
  const mine = match.players[seat].hand;
  const theirs = match.players[opponent(seat)].hand;
  return best(mine, (my) => {
    if (!theirs.length) return evaluatePair(match, seat, my, my);
    let sum = 0;
    for (const their of theirs) sum += evaluatePair(match, seat, my, their);
    return sum / theirs.length;
  });
}

export function pickTargets(match: Match, seat: Seat, choice: ChoiceRequest): number[] {
  const need = Math.min(choice.needed, choice.legal.length);
  if (choice.kind === 'counter-cores') {
    const enemy = match.players[opponent(seat)].cores;
    return rank(choice.legal, (i) => {
      const c = enemy[i];
      if (!c || c.countered) return -999;
      return def(c.id).live - def(c.id).countered;
    }).slice(0, need);
  }
  const own = match.players[seat].cores;
  return rank(choice.legal, (i) => {
    const c = own[i];
    if (!c || !c.countered) return -999;
    return def(c.id).live - def(c.id).countered;
  }).slice(0, need);
}

function coreScore(id: CardId): number {
  const d = def(id);
  return d.live * 1.2 + d.countered * 0.7;
}

function evaluatePair(match: Match, seat: Seat, myId: CardId, theirId: CardId): number {
  const me = match.players[seat];
  const them = match.players[opponent(seat)];
  const playsMine = [...playedIds(me), myId];
  const playsTheirs = [...playedIds(them), theirId];
  const roundIndex = playsMine.length - 1;
  const coresA = toCores(match.players.A.cores);
  const coresB = toCores(match.players.B.cores);
  const preview = resolveRoundPreview(
    seat === 'A' ? myId : theirId,
    seat === 'A' ? theirId : myId,
    seat === 'A' ? playsMine : playsTheirs,
    seat === 'A' ? playsTheirs : playsMine,
    roundIndex,
    match.players.A.pendingDouble,
    match.players.B.pendingDouble,
    coresA,
    coresB,
  );
  const myCountered = seat === 'A' ? preview.counteredA : preview.counteredB;
  const theirCountered = seat === 'A' ? preview.counteredB : preview.counteredA;
  const myVal = seat === 'A' ? preview.valueA : preview.valueB;
  const theirVal = seat === 'A' ? preview.valueB : preview.valueA;
  const myEffect = seat === 'A' ? preview.effectiveA : preview.effectiveB;
  const theirEffect = seat === 'A' ? preview.effectiveB : preview.effectiveA;

  let score = myVal - theirVal;
  score += effectScore(myEffect, match, seat);
  score -= effectScore(theirEffect, match, opponent(seat));

  const prior = playedSlots(me);
  const before = comboBonus(prior, SEAT_FACTION[seat]).bonus;
  const after = comboBonus(
    [...prior, { id: myId, countered: myCountered }],
    SEAT_FACTION[seat],
  ).bonus;
  score += after - before;
  if (theirCountered) score += 0.35;
  if (myCountered) score -= 0.35;
  if (counters(def(theirId).type, def(myId).type)) score -= 0.15;
  return score;
}

function effectScore(effect: EffectId | null, match: Match, seat: Seat): number {
  if (!effect) return 0;
  const enemy = match.players[opponent(seat)];
  const own = match.players[seat];
  switch (effect) {
    case 'counter-1-core':
      return coreSwing(enemy.cores, false, 1);
    case 'counter-2-cores':
      return coreSwing(enemy.cores, false, 2);
    case 'uncounter-1-core':
      return coreSwing(own.cores, true, 1);
    case 'cancel-enemy-effect':
      return 1.5;
    case 'copy-previous':
      return 0;
    case 'double-next':
      return 2.1;
    case 'plus-per-uncountered-core':
      return own.cores.filter((c) => !c.countered).length;
    case 'plus-per-countered-enemy':
      return (
        enemy.cores.filter((c) => c.countered).length +
        enemy.played.filter((s) => s?.countered).length
      );
  }
}

function coreSwing(
  cores: { id: CardId; countered: boolean }[],
  wantCountered: boolean,
  n: number,
): number {
  const pool = cores.filter((c) => c.countered === wantCountered);
  const swings = pool
    .map((c) => def(c.id).live - def(c.id).countered)
    .sort((a, b) => b - a);
  return swings.slice(0, n).reduce((s, x) => s + x, 0) * 0.9;
}

function playedIds(p: { played: (PlayedSlot | null)[] }): CardId[] {
  return p.played.filter((s): s is PlayedSlot => s !== null).map((s) => s.id);
}

function playedSlots(p: { played: (PlayedSlot | null)[] }): { id: CardId; countered: boolean }[] {
  return p.played.filter((s): s is PlayedSlot => s !== null).map((s) => ({ id: s.id, countered: s.countered }));
}

function toCores(cores: { id: CardId; countered: boolean }[]): CoreState[] {
  return cores.map((c) => ({ id: c.id, countered: c.countered }));
}

function best<T>(items: T[], score: (item: T) => number): T {
  let top = items[0];
  let topScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    if (s > topScore) {
      top = item;
      topScore = s;
    }
  }
  return top;
}

function rank<T>(items: T[], score: (item: T) => number): T[] {
  return [...items].sort((a, b) => score(b) - score(a));
}
