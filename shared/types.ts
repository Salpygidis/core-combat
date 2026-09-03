export type Seat = 'A' | 'B';
export type Role = Seat | 'spectator';

export type CardType = 'strike' | 'guard' | 'taunt' | 'powerup';

export type CardId =
  | 'strike-3'
  | 'strike-2'
  | 'taunt-3'
  | 'taunt-2'
  | 'powerup-2'
  | 'powerup-1'
  | 'guard-1'
  | 'guard-2';

export type EffectId =
  | 'counter-1-core'
  | 'counter-2-cores'
  | 'cancel-enemy-effect'
  | 'copy-previous'
  | 'double-next'
  | 'plus-per-countered-enemy'
  | 'plus-per-uncountered-core'
  | 'uncounter-1-core';

export type Phase =
  | 'seating'
  | 'core_select'
  | 'round_select'
  | 'round_choice'
  | 'game_score'
  | 'winner_core'
  | 'match_over';

export interface CardDef {
  id: CardId;
  type: CardType;
  live: number;
  countered: number;
  effect: EffectId;
  typeName: string;
  effectText: string;
}

export interface CoreSlot {
  id: CardId;
  countered: boolean;
  hidden: boolean;
}

export interface PlayedSlot {
  id: CardId;
  countered: boolean;
  hidden: boolean;
  value: number;
  effectRan: boolean;
  cancelled: boolean;
  resolvedEffect: EffectId | null;
}

export interface ChoiceRequest {
  seat: Seat;
  kind: 'counter-cores' | 'uncounter-core';
  /** How many targets the effect wants (Strike 2 wants 2). */
  needed: number;
  /** Legal core indices on the relevant player's core row. */
  legal: number[];
}

export interface RoundLog {
  round: number;
  cardA: CardId;
  cardB: CardId;
  counteredA: boolean;
  counteredB: boolean;
  valueA: number;
  valueB: number;
  effectA: EffectId | null;
  effectB: EffectId | null;
  coreTargetsA: number[];
  coreTargetsB: number[];
  uncounterA: number | null;
  uncounterB: number | null;
}

export interface ScoreLine {
  played: number;
  cores: number;
  effects: number;
  combo: number;
  total: number;
  effectNotes: string[];
  comboNote: string;
}

export interface ScoreBreakdown {
  A: ScoreLine;
  B: ScoreLine;
  winner: Seat | 'tie';
}

export type Intent =
  | { type: 'startMatch' }
  | { type: 'selectCore'; cardId: CardId }
  | { type: 'lockCore' }
  | { type: 'selectCard'; cardId: CardId }
  | { type: 'lockCard' }
  | { type: 'chooseTargets'; indices: number[] }
  | { type: 'ackScore' }
  | { type: 'selectWinnerCore'; cardId: CardId }
  | { type: 'lockWinnerCore' }
  | { type: 'rematch' };

export type HiddenId = CardId | 'hidden';

export interface VisibleCore {
  id: HiddenId;
  countered: boolean;
  hidden: boolean;
}

export interface VisiblePlayed {
  id: HiddenId;
  countered: boolean;
  hidden: boolean;
  value: number;
  effectRan: boolean;
  cancelled: boolean;
  resolvedEffect: EffectId | null;
}

export interface PublicPlayer {
  connected: boolean;
  name: string;
  present: boolean;
  cores: VisibleCore[];
  played: (VisiblePlayed | null)[];
  handCount: number;
  pendingDouble: boolean;
  locked: boolean;
  selected: boolean;
  matchWins: number;
}

export interface PublicMatchState {
  roomCode: string;
  phase: Phase;
  paused: boolean;
  waitingSeats: Seat[];
  hostSeat: Seat;
  gameNumber: number;
  round: number;
  matchWins: Record<Seat, number>;
  spectatorCount: number;
  players: Record<Seat, PublicPlayer>;
  choice: ChoiceRequest | null;
  scoreBreakdown: ScoreBreakdown | null;
  matchWinner: Seat | null;
  lastRound: RoundLog | null;
}

export interface PrivateMatchState extends PublicMatchState {
  you: Role;
  hand: CardId[];
  /** Card you have selected / locked this step (visible only to you while hidden). */
  mySelection: CardId | null;
  myLocked: boolean;
}

export function opponent(seat: Seat): Seat {
  return seat === 'A' ? 'B' : 'A';
}

export const SEATS: Seat[] = ['A', 'B'];
