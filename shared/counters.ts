import type { CardType } from './types.js';

/**
 * Closed counter loop:
 *   Taunt  counters Guard
 *   Guard  counters Strike
 *   Strike counters Power Up
 *   Power Up counters Taunt
 *
 * Same type: no counter. Opposite pair (Taunt/Strike, Guard/Power Up): no counter.
 */
const COUNTERS: Record<CardType, CardType> = {
  taunt: 'guard',
  guard: 'strike',
  strike: 'powerup',
  powerup: 'taunt',
};

export function counters(attacker: CardType, defender: CardType): boolean {
  return COUNTERS[attacker] === defender;
}

export function counterResult(
  typeA: CardType,
  typeB: CardType,
): { counteredA: boolean; counteredB: boolean } {
  return {
    counteredA: counters(typeB, typeA),
    counteredB: counters(typeA, typeB),
  };
}
