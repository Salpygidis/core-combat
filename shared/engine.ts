import { CARD_DEFS, FACTION_COMBOS, FACTION_NAME, SEAT_FACTION, TYPE_PRIORITY, def } from './cards.js';
import { counterResult } from './counters.js';
import type {
  CardId,
  CardType,
  ChoiceRequest,
  CoreSlot,
  EffectId,
  Faction,
  PlayedSlot,
  RoundLog,
  ScoreBreakdown,
  ScoreLine,
  Seat,
} from './types.js';


export interface CoreState {
  id: CardId;
  countered: boolean;
}

export interface RoundInput {
  cardA: CardId;
  cardB: CardId;
  /** Enemy-core indices chosen by A (Strike). */
  coreTargetsA?: number[];
  /** Enemy-core indices chosen by B (Strike). */
  coreTargetsB?: number[];
  /** Own-core index chosen by A (Guard 2). */
  uncounterA?: number | null;
  /** Own-core index chosen by B (Guard 2). */
  uncounterB?: number | null;
}

export interface GameInput {
  coresA: CoreState[];
  coresB: CoreState[];
  rounds: RoundInput[];
}

export interface RoundOutcome {
  counteredA: boolean;
  counteredB: boolean;
  valueA: number;
  valueB: number;
  printedEffectA: EffectId;
  printedEffectB: EffectId;
  effectiveA: EffectId | null;
  effectiveB: EffectId | null;
  pendingDoubleA: boolean;
  pendingDoubleB: boolean;
  choiceQueue: ChoiceRequest[];
}

export function printedEffect(id: CardId): EffectId {
  return CARD_DEFS[id].effect;
}

/**
 * Walk copy-previous (Taunt 2) back through this game's combat plays.
 * Round 1 copy does nothing. Cores never count as "previous".
 */
export function resolveCopiedEffect(
  plays: CardId[],
  roundIndex: number,
): EffectId | null {
  const seen = new Set<number>();
  let i = roundIndex;
  while (i >= 0) {
    if (seen.has(i)) return null;
    seen.add(i);
    const effect = printedEffect(plays[i]);
    if (effect !== 'copy-previous') return effect;
    i -= 1;
  }
  return null;
}

export function effectiveEffect(
  plays: CardId[],
  roundIndex: number,
  typeCountered: boolean,
): EffectId | null {
  if (typeCountered) return null;
  return resolveCopiedEffect(plays, roundIndex);
}

function coresNeeded(effect: EffectId | null): number {
  if (effect === 'counter-1-core') return 1;
  if (effect === 'counter-2-cores') return 2;
  return 0;
}

function uncounteredIndices(cores: CoreState[]): number[] {
  const out: number[] = [];
  cores.forEach((c, i) => {
    if (!c.countered) out.push(i);
  });
  return out;
}

function counteredIndices(cores: CoreState[]): number[] {
  const out: number[] = [];
  cores.forEach((c, i) => {
    if (c.countered) out.push(i);
  });
  return out;
}

function choiceFor(
  seat: Seat,
  effect: EffectId | null,
  enemyCores: CoreState[],
  ownCores: CoreState[],
): ChoiceRequest | null {
  const need = coresNeeded(effect);
  if (need > 0) {
    const legal = uncounteredIndices(enemyCores);
    if (legal.length === 0) return null;
    return { seat, kind: 'counter-cores', needed: need, legal };
  }
  if (effect === 'uncounter-1-core') {
    const legal = counteredIndices(ownCores);
    if (legal.length === 0) return null;
    return { seat, kind: 'uncounter-core', needed: 1, legal };
  }
  return null;
}

/**
 * Choice order: Strike seat, then Guard, then Taunt, then Power Up.
 * If both played the same type, host (A) goes first.
 */
export function sortChoiceQueue(queue: ChoiceRequest[], cardTypeOf: Record<Seat, CardId>): ChoiceRequest[] {
  return [...queue].sort((x, y) => {
    const tx = TYPE_PRIORITY[def(cardTypeOf[x.seat]).type];
    const ty = TYPE_PRIORITY[def(cardTypeOf[y.seat]).type];
    if (tx !== ty) return tx - ty;
    if (x.seat === y.seat) return 0;
    return x.seat === 'A' ? -1 : 1;
  });
}

export function resolveRoundPreview(
  cardA: CardId,
  cardB: CardId,
  playsA: CardId[],
  playsB: CardId[],
  roundIndex: number,
  pendingDoubleA: boolean,
  pendingDoubleB: boolean,
  coresA: CoreState[],
  coresB: CoreState[],
): RoundOutcome {
  const { counteredA, counteredB } = counterResult(def(cardA).type, def(cardB).type);

  const rawA = effectiveEffect(playsA, roundIndex, counteredA);
  const rawB = effectiveEffect(playsB, roundIndex, counteredB);

  const cancelA = rawA === 'cancel-enemy-effect';
  const cancelB = rawB === 'cancel-enemy-effect';

  const effectiveA = rawA && !cancelB ? rawA : null;
  const effectiveB = rawB && !cancelA ? rawB : null;

  const baseA = counteredA ? def(cardA).countered : def(cardA).live;
  const baseB = counteredB ? def(cardB).countered : def(cardB).live;
  const valueA = pendingDoubleA ? baseA * 2 : baseA;
  const valueB = pendingDoubleB ? baseB * 2 : baseB;

  const nextDoubleA = effectiveA === 'double-next';
  const nextDoubleB = effectiveB === 'double-next';

  const choiceA = choiceFor('A', effectiveA, coresB, coresA);
  const choiceB = choiceFor('B', effectiveB, coresA, coresB);
  const choiceQueue = sortChoiceQueue(
    [choiceA, choiceB].filter((c): c is ChoiceRequest => c !== null),
    { A: cardA, B: cardB },
  );

  return {
    counteredA,
    counteredB,
    valueA,
    valueB,
    printedEffectA: printedEffect(cardA),
    printedEffectB: printedEffect(cardB),
    effectiveA,
    effectiveB,
    pendingDoubleA: nextDoubleA,
    pendingDoubleB: nextDoubleB,
    choiceQueue,
  };
}

export function applyCoreChoices(
  coresA: CoreState[],
  coresB: CoreState[],
  seat: Seat,
  choice: ChoiceRequest,
  indices: number[],
): void {
  const unique = [...new Set(indices)];
  const legalSet = new Set(choice.legal);
  const picked = unique.filter((i) => legalSet.has(i)).slice(0, choice.needed);

  if (choice.kind === 'counter-cores') {
    const enemy = seat === 'A' ? coresB : coresA;
    for (const i of picked) {
      if (enemy[i]) enemy[i].countered = true;
    }
  } else {
    const own = seat === 'A' ? coresA : coresB;
    for (const i of picked) {
      if (own[i]) own[i].countered = false;
    }
  }
}

/**
 * Auto-pick when there is no real decision (legal targets <= needed,
 * or exactly the required count and every legal target must be taken).
 */
export function autoTargets(choice: ChoiceRequest): number[] | null {
  if (choice.legal.length <= choice.needed) return [...choice.legal];
  return null;
}

function typesMatchAt(
  plays: { id: CardId; countered: boolean }[],
  start: number,
  types: CardType[],
): boolean {
  if (start + types.length > plays.length) return false;
  for (let k = 0; k < types.length; k++) {
    const p = plays[start + k];
    if (p.countered) return false;
    if (def(p.id).type !== types[k]) return false;
  }
  return true;
}

/**
 * Faction sequences among the 5 played cards, in play order.
 * Cores do not count. A countered card breaks a window.
 * Only the best matching printed combo scores (not the sum).
 */
export function comboBonus(
  plays: { id: CardId; countered: boolean }[],
  faction: Faction,
): { bonus: number; note: string } {
  let best = 0;
  let bestNote = 'No combo';
  const factionName = FACTION_NAME[faction];
  for (const pattern of FACTION_COMBOS[faction]) {
    for (let start = 0; start <= plays.length - pattern.types.length; start++) {
      if (!typesMatchAt(plays, start, pattern.types)) continue;
      if (pattern.bonus > best) {
        best = pattern.bonus;
        bestNote = `${factionName}: ${pattern.label} (+${pattern.bonus})`;
      }
    }
  }
  return { bonus: best, note: bestNote };
}

export interface GameResult {
  breakdown: ScoreBreakdown;
  coresA: CoreState[];
  coresB: CoreState[];
  log: RoundLog[];
}

function endGameBonuses(
  plays: {
    id: CardId;
    countered: boolean;
    effectRan: boolean;
    cancelled: boolean;
    resolvedEffect: EffectId | null;
  }[],
  ownCores: CoreState[],
  enemyCores: CoreState[],
  enemyPlays: { countered: boolean }[],
): { amount: number; notes: string[] } {
  let amount = 0;
  const notes: string[] = [];
  for (const p of plays) {
    if (p.countered || p.cancelled || !p.effectRan || !p.resolvedEffect) continue;
    const effect = p.resolvedEffect;
    if (effect === 'plus-per-uncountered-core') {
      const n = ownCores.filter((c) => !c.countered).length;
      const add = n;
      amount += add;
      const via = p.id === 'guard-1' ? 'Guard 1' : `${def(p.id).typeName} (copied Guard)`;
      notes.push(`${via}: +1 × ${n} uncountered Core${n === 1 ? '' : 's'} = +${add}`);
    }
    if (effect === 'plus-per-countered-enemy') {
      const played = enemyPlays.filter((c) => c.countered).length;
      const cores = enemyCores.filter((c) => c.countered).length;
      const n = played + cores;
      amount += n;
      const via = p.id === 'powerup-1' ? 'Power Up 1' : `${def(p.id).typeName} (copied Power Up)`;
      notes.push(`${via}: +1 × ${n} countered enemy (played ${played} + cores ${cores}) = +${n}`);
    }
  }
  return { amount, notes };
}

/**
 * Deterministic scoring. Targeting choices must be included in `rounds`
 * (the engine does not invent targets).
 */
export function scoreGame(input: GameInput): GameResult {
  const coresA: CoreState[] = input.coresA.map((c) => ({ ...c }));
  const coresB: CoreState[] = input.coresB.map((c) => ({ ...c }));
  const playsA: CardId[] = [];
  const playsB: CardId[] = [];
  const log: RoundLog[] = [];

  let pendingA = false;
  let pendingB = false;
  const playedA: {
    id: CardId;
    countered: boolean;
    effectRan: boolean;
    cancelled: boolean;
    value: number;
    resolvedEffect: EffectId | null;
  }[] = [];
  const playedB: typeof playedA = [];

  for (let r = 0; r < input.rounds.length; r++) {
    const round = input.rounds[r];
    playsA.push(round.cardA);
    playsB.push(round.cardB);
    const preview = resolveRoundPreview(
      round.cardA,
      round.cardB,
      playsA,
      playsB,
      r,
      pendingA,
      pendingB,
      coresA,
      coresB,
    );

    for (const choice of preview.choiceQueue) {
      const indices =
        choice.seat === 'A'
          ? choice.kind === 'counter-cores'
            ? round.coreTargetsA ?? []
            : round.uncounterA != null
              ? [round.uncounterA]
              : []
          : choice.kind === 'counter-cores'
            ? round.coreTargetsB ?? []
            : round.uncounterB != null
              ? [round.uncounterB]
              : [];
      applyCoreChoices(coresA, coresB, choice.seat, choice, indices);
    }

    pendingA = preview.pendingDoubleA;
    pendingB = preview.pendingDoubleB;

    const rawA = effectiveEffect(playsA, r, preview.counteredA);
    const rawB = effectiveEffect(playsB, r, preview.counteredB);
    const cancelledA = !preview.counteredA && rawB === 'cancel-enemy-effect';
    const cancelledB = !preview.counteredB && rawA === 'cancel-enemy-effect';

    playedA.push({
      id: round.cardA,
      countered: preview.counteredA,
      effectRan: preview.effectiveA !== null,
      cancelled: cancelledA,
      value: preview.valueA,
      resolvedEffect: preview.effectiveA,
    });
    playedB.push({
      id: round.cardB,
      countered: preview.counteredB,
      effectRan: preview.effectiveB !== null,
      cancelled: cancelledB,
      value: preview.valueB,
      resolvedEffect: preview.effectiveB,
    });

    log.push({
      round: r + 1,
      cardA: round.cardA,
      cardB: round.cardB,
      counteredA: preview.counteredA,
      counteredB: preview.counteredB,
      valueA: preview.valueA,
      valueB: preview.valueB,
      effectA: preview.effectiveA,
      effectB: preview.effectiveB,
      coreTargetsA: round.coreTargetsA ?? [],
      coreTargetsB: round.coreTargetsB ?? [],
      uncounterA: round.uncounterA ?? null,
      uncounterB: round.uncounterB ?? null,
    });
  }

  const line = (
    played: typeof playedA,
    ownCores: CoreState[],
    enemyCores: CoreState[],
    enemyPlayed: typeof playedA,
    faction: Faction,
  ): ScoreLine => {
    const playedSum = played.reduce((s, p) => s + p.value, 0);
    const coresSum = ownCores.reduce(
      (s, c) => s + (c.countered ? def(c.id).countered : def(c.id).live),
      0,
    );
    const bonuses = endGameBonuses(played, ownCores, enemyCores, enemyPlayed);
    const combo = comboBonus(played, faction);
    return {
      played: playedSum,
      cores: coresSum,
      effects: bonuses.amount,
      combo: combo.bonus,
      total: playedSum + coresSum + bonuses.amount + combo.bonus,
      effectNotes: bonuses.notes,
      comboNote: combo.note,
    };
  };

  const A = line(playedA, coresA, coresB, playedB, SEAT_FACTION.A);
  const B = line(playedB, coresB, coresA, playedA, SEAT_FACTION.B);
  const winner: Seat | 'tie' = A.total > B.total ? 'A' : B.total > A.total ? 'B' : 'tie';

  return {
    breakdown: { A, B, winner },
    coresA,
    coresB,
    log,
  };
}

export function scoreFromBoard(
  playedA: PlayedSlot[],
  playedB: PlayedSlot[],
  coresA: CoreState[],
  coresB: CoreState[],
): ScoreBreakdown {
  const line = (
    played: PlayedSlot[],
    ownCores: CoreState[],
    enemyCores: CoreState[],
    enemyPlayed: PlayedSlot[],
    faction: Faction,
  ): ScoreLine => {
    const playedSum = played.reduce((s, p) => s + p.value, 0);
    const coresSum = ownCores.reduce((s, c) => s + coreValue(c), 0);
    const bonuses = endGameBonuses(played, ownCores, enemyCores, enemyPlayed);
    const combo = comboBonus(played, faction);
    return {
      played: playedSum,
      cores: coresSum,
      effects: bonuses.amount,
      combo: combo.bonus,
      total: playedSum + coresSum + bonuses.amount + combo.bonus,
      effectNotes: bonuses.notes,
      comboNote: combo.note,
    };
  };
  const A = line(playedA, coresA, coresB, playedB, SEAT_FACTION.A);
  const B = line(playedB, coresB, coresA, playedA, SEAT_FACTION.B);
  const winner: Seat | 'tie' = A.total > B.total ? 'A' : B.total > A.total ? 'B' : 'tie';
  return { A, B, winner };
}

export function clearCoreCounters(cores: { countered: boolean }[]): void {
  for (const c of cores) c.countered = false;
}

export function cloneCores(cores: CoreSlot[]): CoreState[] {
  return cores.map((c) => ({ id: c.id, countered: c.countered }));
}

export function coreValue(c: CoreState): number {
  return c.countered ? def(c.id).countered : def(c.id).live;
}
