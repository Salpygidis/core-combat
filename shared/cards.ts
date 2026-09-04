import type { CardDef, CardId, CardType, EffectId, Faction, Seat } from './types.js';

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
    effectText: 'Counter 1 core card',
  },
  'strike-2': {
    id: 'strike-2',
    type: 'strike',
    live: 2,
    countered: -2,
    effect: 'counter-2-cores',
    typeName: 'Strike',
    effectText: 'Counter 2 core cards',
  },
  'taunt-3': {
    id: 'taunt-3',
    type: 'taunt',
    live: 3,
    countered: 0,
    effect: 'cancel-enemy-effect',
    typeName: 'Taunt',
    effectText: 'Cancel the effect of the enemy card',
  },
  'taunt-2': {
    id: 'taunt-2',
    type: 'taunt',
    live: 3,
    countered: -1,
    effect: 'copy-previous',
    typeName: 'Taunt',
    effectText: 'Copy the effect of your previous card',
  },
  'powerup-2': {
    id: 'powerup-2',
    type: 'powerup',
    live: 2,
    countered: 0,
    effect: 'double-next',
    typeName: 'Power Up',
    effectText: 'Double the value of the next card',
  },
  'powerup-1': {
    id: 'powerup-1',
    type: 'powerup',
    live: 3,
    countered: -1,
    effect: 'plus-per-countered-enemy',
    typeName: 'Power Up',
    effectText: 'Add +1 point for each countered enemy card',
  },
  'guard-1': {
    id: 'guard-1',
    type: 'guard',
    live: 3,
    countered: -2,
    effect: 'plus-per-uncountered-core',
    typeName: 'Guard',
    effectText: 'Add +1 point for each uncountered core you have',
  },
  'guard-2': {
    id: 'guard-2',
    type: 'guard',
    live: 2,
    countered: 0,
    effect: 'uncounter-1-core',
    typeName: 'Guard',
    effectText: 'Uncounter 1 core card',
  },
};

export const TYPE_COLOR: Record<CardType, string> = {
  strike: '#9b2b2b',
  guard: '#5c4bb5',
  taunt: '#2a7a72',
  powerup: '#c4a03a',
};

export const TYPE_COLOR_DIM: Record<CardType, string> = {
  strike: '#5c1818',
  guard: '#2e245c',
  taunt: '#143d38',
  powerup: '#6b5414',
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
      return 'Counter 1 core card';
    case 'counter-2-cores':
      return 'Counter 2 core cards';
    case 'cancel-enemy-effect':
      return 'Cancel the effect of the enemy card';
    case 'copy-previous':
      return 'Copy the effect of your previous card';
    case 'double-next':
      return 'Double the value of the next card';
    case 'plus-per-countered-enemy':
      return 'Add +1 point for each countered enemy card';
    case 'plus-per-uncountered-core':
      return 'Add +1 point for each uncountered core you have';
    case 'uncounter-1-core':
      return 'Uncounter 1 core card';
  }
}

export type ComboFace =
  | 'combo-coheed'
  | 'combo-coheed-rev'
  | 'combo-cambria'
  | 'combo-cambria-rev';

export const SEAT_FACTION: Record<Seat, Faction> = {
  A: 'coheed',
  B: 'cambria',
};

export const FACTION_NAME: Record<Faction, string> = {
  coheed: 'Coheed',
  cambria: 'Cambria',
};

export const FACTION_COLOR: Record<Faction, string> = {
  coheed: '#7a2424',
  cambria: '#2a6b5c',
};

export interface ComboPattern {
  types: CardType[];
  bonus: number;
  label: string;
}

/** Printed sequences. Longer pattern is worth more; only the best hit scores. */
export const FACTION_COMBOS: Record<Faction, ComboPattern[]> = {
  cambria: [
    { types: ['taunt', 'powerup', 'strike'], bonus: 4, label: 'Taunt → Power Up → Strike' },
    { types: ['taunt', 'guard'], bonus: 2, label: 'Taunt → Guard' },
  ],
  coheed: [
    { types: ['strike', 'guard', 'powerup'], bonus: 4, label: 'Strike → Guard → Power Up' },
    { types: ['strike', 'powerup'], bonus: 2, label: 'Strike → Power Up' },
  ],
};

export function otherFaction(faction: Faction): Faction {
  return faction === 'coheed' ? 'cambria' : 'coheed';
}

export function comboFace(faction: Faction, reversed = false): ComboFace {
  return reversed ? `combo-${faction}-rev` : `combo-${faction}`;
}

export const TYPE_SHORT: Record<CardType, string> = {
  strike: 'Strike',
  guard: 'Guard',
  taunt: 'Taunt',
  powerup: 'P-Up',
};

export interface ComboLineProgress {
  pattern: ComboPattern;
  matched: number;
  complete: boolean;
  next: CardType | null;
}

export function comboProgress(
  plays: { id: CardId; countered: boolean }[],
  faction: Faction,
): ComboLineProgress[] {
  const trail: CardType[] = [];
  for (let i = plays.length - 1; i >= 0; i--) {
    if (plays[i].countered) break;
    trail.unshift(def(plays[i].id).type);
  }

  return FACTION_COMBOS[faction].map((pattern) => {
    let complete = false;
    for (let start = 0; start <= plays.length - pattern.types.length; start++) {
      if (sequenceAt(plays, start, pattern.types)) {
        complete = true;
        break;
      }
    }
    let matched = 0;
    if (complete) {
      matched = pattern.types.length;
    } else {
      const max = Math.min(trail.length, pattern.types.length - 1);
      for (let k = max; k >= 1; k--) {
        const suffix = trail.slice(-k);
        if (pattern.types.slice(0, k).every((t, i) => t === suffix[i])) {
          matched = k;
          break;
        }
      }
    }
    return {
      pattern,
      matched,
      complete,
      next: complete ? null : pattern.types[matched] ?? null,
    };
  });
}

function sequenceAt(
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

export const COMBO_TEXT =
  'Coheed: Strike → Power Up +2 · Strike → Guard → Power Up +4. Cambria: Taunt → Guard +2 · Taunt → Power Up → Strike +4.';
