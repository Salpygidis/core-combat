import { DECK } from './cards.js';
import {
  autoTargets,
  clearCoreCounters,
  effectiveEffect,
  resolveRoundPreview,
  scoreFromBoard,
  type CoreState,
} from './engine.js';
import type {
  CardId,
  ChoiceRequest,
  CoreSlot,
  HiddenId,
  Intent,
  Phase,
  PlayedSlot,
  PrivateMatchState,
  PublicMatchState,
  PublicPlayer,
  RoundLog,
  ScoreBreakdown,
  Seat,
  VisibleCore,
  VisiblePlayed,
} from './types.js';
import { opponent, SEATS, type Role } from './types.js';

export interface InternalPlayer {
  token: string;
  socketId: string | null;
  connected: boolean;
  name: string;
  present: boolean;
  cores: CoreSlot[];
  hand: CardId[];
  played: (PlayedSlot | null)[];
  pendingDouble: boolean;
  selection: CardId | null;
  locked: boolean;
  matchWins: number;
}

export interface ApplyResult {
  ok: boolean;
  error?: string;
  swapped?: boolean;
}

function emptyPlayed(): (PlayedSlot | null)[] {
  return [null, null, null, null, null];
}

function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makePlayer(name: string): InternalPlayer {
  return {
    token: randomToken(),
    socketId: null,
    connected: false,
    name,
    present: false,
    cores: [],
    hand: [...DECK],
    played: emptyPlayed(),
    pendingDouble: false,
    selection: null,
    locked: false,
    matchWins: 0,
  };
}

function asCoreState(cores: CoreSlot[]): CoreState[] {
  return cores.map((c) => ({ id: c.id, countered: c.countered }));
}

function maskId(id: CardId, hide: boolean): HiddenId {
  return hide ? 'hidden' : id;
}

export class Match {
  readonly roomCode: string;
  hostSeat: Seat = 'A';
  phase: Phase = 'seating';
  paused = false;
  gameNumber = 1;
  round = 1;
  spectatorCount = 0;
  players: Record<Seat, InternalPlayer> = {
    A: makePlayer('Player A'),
    B: makePlayer('Player B'),
  };
  choiceQueue: ChoiceRequest[] = [];
  scoreBreakdown: ScoreBreakdown | null = null;
  matchWinner: Seat | null = null;
  lastRound: RoundLog | null = null;
  acks: Record<Seat, boolean> = { A: false, B: false };
  private playsA: CardId[] = [];
  private playsB: CardId[] = [];

  constructor(roomCode: string) {
    this.roomCode = roomCode;
  }

  occupy(seat: Seat, name: string | undefined, socketId: string): { token: string } | { error: string } {
    const p = this.players[seat];
    if (p.present && p.connected) return { error: `Seat ${seat} is taken` };
    if (p.present && !p.connected) {
      return { error: 'Seat is waiting for the original player to reconnect' };
    }
    p.present = true;
    p.connected = true;
    p.socketId = socketId;
    if (name && name.trim()) p.name = name.trim().slice(0, 18);
    return { token: p.token };
  }

  reconnect(seat: Seat, token: string, socketId: string): ApplyResult {
    const p = this.players[seat];
    if (!p.present) return { ok: false, error: 'Seat is empty' };
    if (p.token !== token) return { ok: false, error: 'Invalid reconnect token' };
    p.connected = true;
    p.socketId = socketId;
    this.refreshPause();
    return { ok: true };
  }

  disconnectSocket(socketId: string): Seat | 'spectator' | null {
    for (const seat of SEATS) {
      const p = this.players[seat];
      if (p.socketId === socketId) {
        p.connected = false;
        p.socketId = null;
        this.refreshPause();
        return seat;
      }
    }
    return 'spectator';
  }

  private refreshPause(): void {
    if (this.phase === 'seating' || this.phase === 'match_over') {
      this.paused = false;
      return;
    }
    this.paused = SEATS.some((s) => this.players[s].present && !this.players[s].connected);
  }

  bothSeated(): boolean {
    return this.players.A.present && this.players.B.present;
  }

  apply(seat: Seat, intent: Intent): ApplyResult {
    if (this.paused) return { ok: false, error: 'Match paused — waiting for a player to reconnect' };
    if (!this.players[seat].present) return { ok: false, error: 'Seat is empty' };

    switch (intent.type) {
      case 'startMatch':
        return this.startMatch(seat);
      case 'selectCore':
        return this.selectFromHand(seat, intent.cardId, 'core_select');
      case 'lockCore':
        return this.lockCore(seat);
      case 'selectCard':
        return this.selectFromHand(seat, intent.cardId, 'round_select');
      case 'lockCard':
        return this.lockCard(seat);
      case 'chooseTargets':
        return this.chooseTargets(seat, intent.indices);
      case 'ackScore':
        return this.ackScore(seat);
      case 'selectWinnerCore':
        return this.selectWinnerCore(seat, intent.cardId);
      case 'lockWinnerCore':
        return this.lockWinnerCore(seat);
      case 'rematch':
        return this.rematch(seat);
      case 'swapSeats':
        return this.swapSeats(seat);
    }
  }

  private startMatch(seat: Seat): ApplyResult {
    if (this.phase !== 'seating') return { ok: false, error: 'Match already started' };
    if (seat !== this.hostSeat) return { ok: false, error: 'Only the host can start' };
    if (!this.bothSeated()) return { ok: false, error: 'Need two players' };
    this.resetMatchKeepSeats();
    this.phase = 'core_select';
    this.beginPick();
    return { ok: true };
  }

  private rematch(seat: Seat): ApplyResult {
    if (this.phase !== 'match_over') return { ok: false, error: 'Match is not over' };
    if (seat !== this.hostSeat) return { ok: false, error: 'Only the host can rematch' };
    this.resetMatchKeepSeats();
    this.phase = 'core_select';
    this.beginPick();
    return { ok: true };
  }

  /** Swap who sits A/B (and thus Coheed/Cambria). Host follows the player. */
  private swapSeats(seat: Seat): ApplyResult {
    if (this.phase !== 'match_over') return { ok: false, error: 'Match is not over' };
    if (!this.players[seat].present) return { ok: false, error: 'Seat is empty' };
    const a = this.players.A;
    const b = this.players.B;
    const hold = {
      token: a.token,
      socketId: a.socketId,
      connected: a.connected,
      name: a.name,
      present: a.present,
      matchWins: a.matchWins,
    };
    a.token = b.token;
    a.socketId = b.socketId;
    a.connected = b.connected;
    a.name = b.name;
    a.present = b.present;
    a.matchWins = b.matchWins;
    b.token = hold.token;
    b.socketId = hold.socketId;
    b.connected = hold.connected;
    b.name = hold.name;
    b.present = hold.present;
    b.matchWins = hold.matchWins;
    this.hostSeat = opponent(this.hostSeat);
    if (this.matchWinner) this.matchWinner = opponent(this.matchWinner);
    return { ok: true, swapped: true };
  }

  private resetMatchKeepSeats(): void {
    this.gameNumber = 1;
    this.round = 1;
    this.matchWinner = null;
    this.scoreBreakdown = null;
    this.lastRound = null;
    this.choiceQueue = [];
    this.playsA = [];
    this.playsB = [];
    this.paused = false;
    for (const s of SEATS) {
      const p = this.players[s];
      this.players[s] = {
        ...makePlayer(p.name),
        token: p.token,
        socketId: p.socketId,
        connected: p.connected,
        name: p.name,
        present: p.present,
      };
    }
  }

  private beginPick(): void {
    for (const s of SEATS) {
      this.players[s].selection = null;
      this.players[s].locked = false;
    }
    this.acks = { A: false, B: false };
  }

  private selectFromHand(seat: Seat, cardId: CardId, expected: Phase): ApplyResult {
    if (this.phase !== expected) return { ok: false, error: 'Not your pick phase' };
    const p = this.players[seat];
    if (p.locked) return { ok: false, error: 'Already locked' };
    if (!p.hand.includes(cardId)) return { ok: false, error: 'Card is not in your hand' };
    p.selection = cardId;
    return { ok: true };
  }

  private lockCore(seat: Seat): ApplyResult {
    if (this.phase !== 'core_select') return { ok: false, error: 'Not selecting cores' };
    const p = this.players[seat];
    if (!p.selection) return { ok: false, error: 'Select a card first' };
    if (p.locked) return { ok: false, error: 'Already locked' };
    p.locked = true;
    p.cores = [{ id: p.selection, countered: false, hidden: true }];
    p.hand = p.hand.filter((c) => c !== p.selection);
    if (this.players.A.locked && this.players.B.locked) this.revealInitialCores();
    return { ok: true };
  }

  private revealInitialCores(): void {
    for (const s of SEATS) {
      const p = this.players[s];
      if (p.cores[0]) p.cores[0].hidden = false;
      p.selection = null;
      p.locked = false;
      p.played = emptyPlayed();
      p.pendingDouble = false;
    }
    this.round = 1;
    this.playsA = [];
    this.playsB = [];
    this.phase = 'round_select';
    this.beginPick();
  }

  private lockCard(seat: Seat): ApplyResult {
    if (this.phase !== 'round_select') return { ok: false, error: 'Not a combat round' };
    const p = this.players[seat];
    if (!p.selection) return { ok: false, error: 'Select a card first' };
    if (p.locked) return { ok: false, error: 'Already locked' };
    p.locked = true;
    p.played[this.round - 1] = {
      id: p.selection,
      countered: false,
      hidden: true,
      value: 0,
      effectRan: false,
      cancelled: false,
      resolvedEffect: null,
    };
    p.hand = p.hand.filter((c) => c !== p.selection);
    if (this.players.A.locked && this.players.B.locked) this.revealRound();
    return { ok: true };
  }

  private revealRound(): void {
    // Cores only stay countered for the round that hit them.
    if (this.round > 1) {
      clearCoreCounters(this.players.A.cores);
      clearCoreCounters(this.players.B.cores);
    }
    const a = this.players.A;
    const b = this.players.B;
    const cardA = a.selection!;
    const cardB = b.selection!;
    this.playsA.push(cardA);
    this.playsB.push(cardB);

    const preview = resolveRoundPreview(
      cardA,
      cardB,
      this.playsA,
      this.playsB,
      this.round - 1,
      a.pendingDouble,
      b.pendingDouble,
      asCoreState(a.cores),
      asCoreState(b.cores),
    );

    const rawA = effectiveEffect(this.playsA, this.round - 1, preview.counteredA);
    const rawB = effectiveEffect(this.playsB, this.round - 1, preview.counteredB);

    const slotA = a.played[this.round - 1]!;
    const slotB = b.played[this.round - 1]!;
    Object.assign(slotA, {
      hidden: false,
      countered: preview.counteredA,
      value: preview.valueA,
      effectRan: preview.effectiveA !== null,
      cancelled: !preview.counteredA && rawB === 'cancel-enemy-effect',
      resolvedEffect: preview.effectiveA,
    });
    Object.assign(slotB, {
      hidden: false,
      countered: preview.counteredB,
      value: preview.valueB,
      effectRan: preview.effectiveB !== null,
      cancelled: !preview.counteredB && rawA === 'cancel-enemy-effect',
      resolvedEffect: preview.effectiveB,
    });

    a.pendingDouble = preview.pendingDoubleA;
    b.pendingDouble = preview.pendingDoubleB;

    this.lastRound = {
      round: this.round,
      cardA,
      cardB,
      counteredA: preview.counteredA,
      counteredB: preview.counteredB,
      valueA: preview.valueA,
      valueB: preview.valueB,
      effectA: preview.effectiveA,
      effectB: preview.effectiveB,
      coreTargetsA: [],
      coreTargetsB: [],
      uncounterA: null,
      uncounterB: null,
    };

    this.choiceQueue = [...preview.choiceQueue];
    this.drainAutoChoices();
  }

  private drainAutoChoices(): void {
    while (this.choiceQueue.length) {
      const choice = this.choiceQueue[0];
      const auto = autoTargets(choice);
      if (auto === null) {
        this.phase = 'round_choice';
        return;
      }
      this.commitChoice(choice, auto);
      this.choiceQueue.shift();
    }
    this.finishRound();
  }

  private commitChoice(choice: ChoiceRequest, indices: number[]): void {
    const unique = [...new Set(indices)]
      .filter((i) => choice.legal.includes(i))
      .slice(0, choice.needed);
    if (choice.kind === 'counter-cores') {
      const enemy = this.players[opponent(choice.seat)].cores;
      for (const i of unique) {
        if (enemy[i]) enemy[i].countered = true;
      }
    } else {
      const own = this.players[choice.seat].cores;
      for (const i of unique) {
        if (own[i]) own[i].countered = false;
      }
    }
    if (!this.lastRound) return;
    if (choice.kind === 'counter-cores') {
      if (choice.seat === 'A') this.lastRound.coreTargetsA = unique;
      else this.lastRound.coreTargetsB = unique;
    } else {
      const idx = unique[0] ?? null;
      if (choice.seat === 'A') this.lastRound.uncounterA = idx;
      else this.lastRound.uncounterB = idx;
    }
  }

  private chooseTargets(seat: Seat, indices: number[]): ApplyResult {
    if (this.phase !== 'round_choice') return { ok: false, error: 'Not choosing targets' };
    const choice = this.choiceQueue[0];
    if (!choice || choice.seat !== seat) return { ok: false, error: 'Not your choice' };
    const legal = new Set(choice.legal);
    const picked = [...new Set(indices)].filter((i) => legal.has(i));
    const needed = Math.min(choice.needed, choice.legal.length);
    if (picked.length !== needed) {
      return { ok: false, error: `Pick ${needed} target${needed === 1 ? '' : 's'}` };
    }
    this.commitChoice(choice, picked);
    this.choiceQueue.shift();
    this.drainAutoChoices();
    return { ok: true };
  }

  private finishRound(): void {
    this.players.A.selection = null;
    this.players.B.selection = null;
    this.players.A.locked = false;
    this.players.B.locked = false;
    if (this.round >= 5) {
      this.endGame();
      return;
    }
    this.round += 1;
    this.phase = 'round_select';
    this.beginPick();
  }

  private endGame(): void {
    const playedA = this.players.A.played.filter((p): p is PlayedSlot => p !== null);
    const playedB = this.players.B.played.filter((p): p is PlayedSlot => p !== null);
    this.scoreBreakdown = scoreFromBoard(
      playedA,
      playedB,
      asCoreState(this.players.A.cores),
      asCoreState(this.players.B.cores),
    );
    this.phase = 'game_score';
    this.acks = { A: false, B: false };
  }

  private ackScore(seat: Seat): ApplyResult {
    if (this.phase !== 'game_score') return { ok: false, error: 'Not on the score screen' };
    this.acks[seat] = true;
    if (this.acks.A && this.acks.B) this.afterScore();
    return { ok: true };
  }

  private afterScore(): void {
    const winner = this.scoreBreakdown?.winner;
    if (winner === 'A' || winner === 'B') {
      this.players[winner].matchWins += 1;
      if (this.players[winner].cores.length >= 3) {
        this.matchWinner = winner;
        this.phase = 'match_over';
        return;
      }
      this.phase = 'winner_core';
      const w = this.players[winner];
      w.hand = this.availableNonCores(winner);
      for (const s of SEATS) this.players[s].played = emptyPlayed();
      this.beginPick();
      return;
    }
    this.startNextGame();
  }

  private selectWinnerCore(seat: Seat, cardId: CardId): ApplyResult {
    if (this.phase !== 'winner_core') return { ok: false, error: 'Not parking a Core' };
    const winner = this.scoreBreakdown?.winner;
    if (winner !== seat) return { ok: false, error: 'Only the winner parks a Core' };
    const p = this.players[seat];
    if (p.locked) return { ok: false, error: 'Already locked' };
    if (!this.availableNonCores(seat).includes(cardId)) {
      return { ok: false, error: 'That card is already a Core' };
    }
    p.selection = cardId;
    return { ok: true };
  }

  private lockWinnerCore(seat: Seat): ApplyResult {
    if (this.phase !== 'winner_core') return { ok: false, error: 'Not parking a Core' };
    const winner = this.scoreBreakdown?.winner;
    if (winner !== seat) return { ok: false, error: 'Only the winner parks a Core' };
    const p = this.players[seat];
    if (!p.selection) return { ok: false, error: 'Select a card first' };
    p.cores.push({ id: p.selection, countered: false, hidden: false });
    p.selection = null;
    p.locked = false;
    this.startNextGame();
    return { ok: true };
  }

  private availableNonCores(seat: Seat): CardId[] {
    const coreIds = new Set(this.players[seat].cores.map((c) => c.id));
    return DECK.filter((id) => !coreIds.has(id));
  }

  private startNextGame(): void {
    this.gameNumber += 1;
    this.round = 1;
    this.scoreBreakdown = null;
    this.lastRound = null;
    this.playsA = [];
    this.playsB = [];
    this.choiceQueue = [];
    for (const s of SEATS) {
      const p = this.players[s];
      const coreIds = new Set(p.cores.map((c) => c.id));
      p.hand = DECK.filter((id) => !coreIds.has(id));
      p.played = emptyPlayed();
      p.pendingDouble = false;
      clearCoreCounters(p.cores);
    }
    this.phase = 'round_select';
    this.beginPick();
  }

  waitingSeats(): Seat[] {
    if (this.paused) {
      return SEATS.filter((s) => this.players[s].present && !this.players[s].connected);
    }
    switch (this.phase) {
      case 'seating':
        return SEATS.filter((s) => !this.players[s].present);
      case 'core_select':
      case 'round_select':
        return SEATS.filter((s) => !this.players[s].locked);
      case 'round_choice':
        return this.choiceQueue[0] ? [this.choiceQueue[0].seat] : [];
      case 'game_score':
        return SEATS.filter((s) => !this.acks[s]);
      case 'winner_core': {
        const w = this.scoreBreakdown?.winner;
        return w === 'A' || w === 'B' ? [w] : [];
      }
      case 'match_over':
        return [];
    }
  }

  getPublicState(): PublicMatchState {
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      paused: this.paused,
      waitingSeats: this.waitingSeats(),
      hostSeat: this.hostSeat,
      gameNumber: this.gameNumber,
      round: this.round,
      matchWins: { A: this.players.A.matchWins, B: this.players.B.matchWins },
      spectatorCount: this.spectatorCount,
      players: {
        A: this.publicPlayer('A', null),
        B: this.publicPlayer('B', null),
      },
      choice: this.phase === 'round_choice' ? this.choiceQueue[0] ?? null : null,
      scoreBreakdown: this.scoreBreakdown,
      matchWinner: this.matchWinner,
      lastRound: this.lastRound,
    };
  }

  getPrivateState(you: Role): PrivateMatchState {
    if (you === 'spectator') {
      return {
        ...this.getPublicState(),
        you,
        hand: [],
        mySelection: null,
        myLocked: false,
        players: {
          A: this.publicPlayer('A', 'spectator'),
          B: this.publicPlayer('B', 'spectator'),
        },
      };
    }
    const me = this.players[you];
    return {
      ...this.getPublicState(),
      you,
      hand: [...me.hand],
      mySelection: me.selection,
      myLocked: me.locked,
      players: {
        A: this.publicPlayer('A', you),
        B: this.publicPlayer('B', you),
      },
    };
  }

  private publicPlayer(seat: Seat, viewer: Role | null): PublicPlayer {
    const p = this.players[seat];
    const hide = viewer !== null && viewer !== seat;

    const cores: VisibleCore[] = p.cores.map((c) => ({
      id: maskId(c.id, hide && c.hidden),
      countered: c.countered,
      hidden: c.hidden,
    }));

    const played: (VisiblePlayed | null)[] = p.played.map((slot) => {
      if (!slot) return null;
      const hideId = hide && slot.hidden;
      return {
        id: maskId(slot.id, hideId),
        countered: slot.countered,
        hidden: slot.hidden,
        value: hideId ? 0 : slot.value,
        effectRan: slot.effectRan,
        cancelled: slot.cancelled,
        resolvedEffect: hideId ? null : slot.resolvedEffect,
      };
    });

    let handCount = p.hand.length;
    if (this.phase === 'winner_core') {
      const winner = this.scoreBreakdown?.winner;
      handCount = winner === seat ? p.hand.length : this.availableNonCores(seat).length;
    }

    return {
      connected: p.connected,
      name: p.name,
      present: p.present,
      cores,
      played,
      handCount,
      pendingDouble: p.pendingDouble,
      locked: p.locked,
      selected: p.selection !== null,
      matchWins: p.matchWins,
    };
  }
}
