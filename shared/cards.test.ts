import { describe, expect, it } from 'vitest';
import { CARD_DEFS, DECK, comboProgress, def } from './cards.js';

describe('published deck', () => {
  it('has eight unique playable cards', () => {
    expect(DECK).toHaveLength(8);
    expect(new Set(DECK).size).toBe(8);
    expect(Object.keys(CARD_DEFS).sort()).toEqual([...DECK].sort());
  });

  it('matches the printed live / countered / effect values', () => {
    expect(def('guard-2')).toMatchObject({
      live: 2,
      countered: 0,
      effect: 'uncounter-1-core',
    });
    expect(def('guard-1')).toMatchObject({
      live: 3,
      countered: -2,
      effect: 'plus-per-uncountered-core',
    });
    expect(def('powerup-2')).toMatchObject({
      live: 2,
      countered: 0,
      effect: 'double-next',
    });
    expect(def('powerup-1')).toMatchObject({
      live: 3,
      countered: -1,
      effect: 'plus-per-countered-enemy',
    });
    expect(def('strike-3')).toMatchObject({
      live: 3,
      countered: -1,
      effect: 'counter-1-core',
    });
    expect(def('strike-2')).toMatchObject({
      live: 2,
      countered: -2,
      effect: 'counter-2-cores',
    });
    expect(def('taunt-3')).toMatchObject({
      live: 3,
      countered: 0,
      effect: 'cancel-enemy-effect',
    });
    expect(def('taunt-2')).toMatchObject({
      live: 3,
      countered: -1,
      effect: 'copy-previous',
    });
  });
});

describe('combo progress', () => {
  it('highlights Coheed Strike as the start of both lines', () => {
    const lines = comboProgress([{ id: 'strike-3', countered: false }], 'coheed');
    const plus2 = lines.find((l) => l.pattern.bonus === 2)!;
    const plus4 = lines.find((l) => l.pattern.bonus === 4)!;
    expect(plus2.matched).toBe(1);
    expect(plus2.next).toBe('powerup');
    expect(plus4.matched).toBe(1);
    expect(plus4.next).toBe('guard');
  });

  it('marks Strike → Power Up complete', () => {
    const lines = comboProgress(
      [
        { id: 'strike-3', countered: false },
        { id: 'powerup-2', countered: false },
      ],
      'coheed',
    );
    const plus2 = lines.find((l) => l.pattern.bonus === 2)!;
    expect(plus2.complete).toBe(true);
    expect(plus2.next).toBe(null);
  });

  it('ignores a countered Strike', () => {
    const lines = comboProgress([{ id: 'strike-3', countered: true }], 'coheed');
    expect(lines.every((l) => l.matched === 0)).toBe(true);
  });
});
