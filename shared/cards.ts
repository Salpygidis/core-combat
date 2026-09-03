import type { CardDef, CardId, CardType, EffectId } from './types.js';

export const DECK: CardId[] = [
  'strike-3',
  'strike-2',
  'taunt-3',
  'taunt-2',
  'powerup-2',
  'powerup-1',
  'guard-1',
  'guard-2',
];

export const CARD_DEFS: Record<CardId, CardDef> = {
  'strike-3': {
    id: 'strike-3',
    type: 'strike',
    live: 3,
    countered: -1,
    effect: 'counter-1-core',
    typeName: 'Strike',
    effectText: 'Counter 1 enemy Core',
  },
  'strike-2': {
    id: 'strike-2',
    type: 'strike',
    live: 2,
    countered: -1,
    effect: 'counter-2-cores',
    typeName: 'Strike',
    effectText: 'Counter 2 enemy Cores',
  },
  'taunt-3': {
    id: 'taunt-3',
    type: 'taunt',
    live: 3,
    countered: -1,
    effect: 'cancel-enemy-effect',
    typeName: 'Taunt',
    effectText: "Cancel the enemy card's effect this round",
  },
  'taunt-2': {
    id: 'taunt-2',
    type: 'taunt',
    live: 2,
    countered: -1,
    effect: 'copy-previous',
    typeName: 'Taunt',
    effectText: "Copy your previous card's effect",
  },
  'powerup-2': {
    id: 'powerup-2',
    type: 'powerup',
    live: 2,
    countered: 0,
    effect: 'double-next',
    typeName: 'Power Up',
    effectText: 'Double the value of your next card',
  },
  'powerup-1': {
    id: 'powerup-1',
    type: 'powerup',
    live: 1,
    countered: 1,
    effect: 'plus-per-countered-enemy',
    typeName: 'Power Up',
    effectText: '+1 per countered enemy card',
  },
  'guard-1': {
    id: 'guard-1',
    type: 'guard',
    live: 1,
    countered: 1,
    effect: 'plus-per-uncountered-core',
    typeName: 'Guard',
    effectText: '+2 per your uncountered Core',
  },
  'guard-2': {
    id: 'guard-2',
    type: 'guard',
    live: 2,
    countered: 0,
    effect: 'uncounter-1-core',
    typeName: 'Guard',
    effectText: 'Uncounter 1 of your Cores',
  },
};

export const TYPE_COLOR: Record<CardType, string> = {
  strike: '#c62828',
  guard: '#1565c0',
  taunt: '#f9a825',
  powerup: '#6a1b9a',
};

export const TYPE_COLOR_DIM: Record<CardType, string> = {
  strike: '#7f1d1d',
  guard: '#1e3a5f',
  taunt: '#7a5b12',
  powerup: '#3b0764',
};

export const TYPE_PRIORITY: Record<CardType, number> = {
  strike: 0,
  guard: 1,
  taunt: 2,
  powerup: 3,
};

export function def(id: CardId): CardDef {
  return CARD_DEFS[id];
}

export function cardType(id: CardId): CardType {
  return CARD_DEFS[id].type;
}

export function effectText(effect: EffectId): string {
  switch (effect) {
    case 'counter-1-core':
      return 'Counter 1 enemy Core';
    case 'counter-2-cores':
      return 'Counter 2 enemy Cores';
    case 'cancel-enemy-effect':
      return "Cancel the enemy card's effect this round";
    case 'copy-previous':
      return "Copy your previous card's effect";
    case 'double-next':
      return 'Double the value of your next card';
    case 'plus-per-countered-enemy':
      return '+1 per countered enemy card';
    case 'plus-per-uncountered-core':
      return '+2 per your uncountered Core';
    case 'uncounter-1-core':
      return 'Uncounter 1 of your Cores';
  }
}

export const COMBO_TEXT = '2 uncountered same type +2 · 3 uncountered same type +5 (best only)';
