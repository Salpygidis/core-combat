import { describe, expect, it } from 'vitest';
import { comboBonus, resolveCopiedEffect, resolveRoundPreview, scoreGame } from './engine.js';
import { counterResult, counters } from './counters.js';

describe('counter loop', () => {
  it('follows the closed loop', () => {
    expect(counters('taunt', 'guard')).toBe(true);
    expect(counters('guard', 'strike')).toBe(true);
    expect(counters('strike', 'powerup')).toBe(true);
    expect(counters('powerup', 'taunt')).toBe(true);
  });

  it('same type does not counter', () => {
    for (const t of ['strike', 'guard', 'taunt', 'powerup'] as const) {
      expect(counters(t, t)).toBe(false);
    }
  });

  it('opposite pairs do not counter', () => {
    expect(counterResult('taunt', 'strike')).toEqual({ counteredA: false, counteredB: false });
    expect(counterResult('guard', 'powerup')).toEqual({ counteredA: false, counteredB: false });
  });

  it('is one-way', () => {
    expect(counterResult('guard', 'strike')).toEqual({ counteredA: false, counteredB: true });
    expect(counterResult('strike', 'powerup')).toEqual({ counteredA: false, counteredB: true });
  });
});

describe('round resolution', () => {
  it('rotates to countered value', () => {
    const r = resolveRoundPreview(
      'guard-1',
      'strike-3',
      ['guard-1'],
      ['strike-3'],
      0,
      false,
      false,
      [],
      [],
    );
    expect(r.counteredB).toBe(true);
    expect(r.valueB).toBe(-1);
    expect(r.effectiveB).toBe(null);
    expect(r.effectiveA).toBe('plus-per-uncountered-core');
  });

  it('Power Up 2 doubles the next card value', () => {
    const r1 = resolveRoundPreview(
      'powerup-2',
      'taunt-3',
      ['powerup-2'],
      ['taunt-3'],
      0,
      false,
      false,
      [],
      [],
    );
    // Power Up counters Taunt, so Taunt is countered and Power Up is live
    expect(r1.counteredB).toBe(true);
    expect(r1.pendingDoubleA).toBe(true);

    const r2 = resolveRoundPreview(
      'strike-3',
      'taunt-2',
      ['powerup-2', 'strike-3'],
      ['taunt-3', 'taunt-2'],
      1,
      true,
      false,
      [],
      [],
    );
    // Strike vs Taunt: no type counter, live 3 doubled to 6
    expect(r2.counteredA).toBe(false);
    expect(r2.valueA).toBe(6);
  });

  it('countered Power Up 2 does not double next', () => {
    const r1 = resolveRoundPreview(
      'powerup-2',
      'strike-2',
      ['powerup-2'],
      ['strike-2'],
      0,
      false,
      false,
      [],
      [],
    );
    expect(r1.counteredA).toBe(true);
    expect(r1.pendingDoubleA).toBe(false);
  });

  it('live Taunt 3 cancels the enemy effect', () => {
    const r = resolveRoundPreview(
      'taunt-3',
      'strike-3',
      ['taunt-3'],
      ['strike-3'],
      0,
      false,
      false,
      [],
      [{ id: 'guard-1', countered: false }],
    );
    expect(r.counteredA).toBe(false);
    expect(r.counteredB).toBe(false);
    expect(r.effectiveA).toBe('cancel-enemy-effect');
    expect(r.effectiveB).toBe(null);
    expect(r.choiceQueue).toEqual([]);
  });

  it('Taunt 2 copies previous Strike and asks for a core', () => {
    const r = resolveRoundPreview(
      'taunt-2',
      'guard-1',
      ['strike-3', 'taunt-2'],
      ['powerup-1', 'guard-1'],
      1,
      false,
      false,
      [],
      [{ id: 'powerup-2', countered: false }],
    );
    // Taunt counters Guard
    expect(r.counteredB).toBe(true);
    expect(r.effectiveA).toBe('counter-1-core');
    expect(r.choiceQueue[0]?.kind).toBe('counter-cores');
    expect(r.choiceQueue[0]?.seat).toBe('A');
  });

  it('Taunt 2 in round 1 copies nothing', () => {
    expect(resolveCopiedEffect(['taunt-2'], 0)).toBe(null);
    const r = resolveRoundPreview(
      'taunt-2',
      'strike-3',
      ['taunt-2'],
      ['strike-3'],
      0,
      false,
      false,
      [],
      [],
    );
    expect(r.effectiveA).toBe(null);
  });

  it('Strike chooses before Guard when both need a target', () => {
    const r = resolveRoundPreview(
      'guard-2',
      'strike-3',
      ['guard-2'],
      ['strike-3'],
      0,
      false,
      false,
      [{ id: 'taunt-3', countered: true }],
      [{ id: 'powerup-1', countered: false }],
    );
    // Guard counters Strike, so Strike is countered — only Guard 2 should choose
    expect(r.counteredB).toBe(true);
    expect(r.choiceQueue.map((c) => c.seat)).toEqual(['A']);
  });

  it('both live Strikes: host (A) chooses first', () => {
    const r = resolveRoundPreview(
      'strike-3',
      'strike-2',
      ['strike-3'],
      ['strike-2'],
      0,
      false,
      false,
      [{ id: 'guard-1', countered: false }],
      [{ id: 'guard-2', countered: false }, { id: 'taunt-3', countered: false }],
    );
    expect(r.counteredA).toBe(false);
    expect(r.counteredB).toBe(false);
    expect(r.choiceQueue.map((c) => c.seat)).toEqual(['A', 'B']);
  });
});

describe('combo', () => {
  it('awards +2 for two uncountered of the same type in a row', () => {
    const { bonus } = comboBonus([
      { id: 'strike-3', countered: false },
      { id: 'strike-2', countered: false },
      { id: 'taunt-3', countered: false },
      { id: 'guard-1', countered: false },
      { id: 'powerup-1', countered: false },
    ]);
    expect(bonus).toBe(2);
  });

  it('does not combo if one of the pair is countered', () => {
    const { bonus } = comboBonus([
      { id: 'strike-3', countered: false },
      { id: 'strike-2', countered: true },
      { id: 'taunt-3', countered: false },
      { id: 'guard-1', countered: false },
      { id: 'powerup-1', countered: false },
    ]);
    expect(bonus).toBe(0);
  });

  it('awards +5 for three uncountered of the same type in a row', () => {
    const { bonus } = comboBonus([
      { id: 'strike-3', countered: false },
      { id: 'strike-2', countered: false },
      { id: 'strike-3', countered: false },
      { id: 'guard-1', countered: false },
      { id: 'powerup-1', countered: false },
    ]);
    expect(bonus).toBe(5);
  });

  it('takes the better of two sequences, not the sum', () => {
    const { bonus } = comboBonus([
      { id: 'strike-3', countered: false },
      { id: 'strike-2', countered: false },
      { id: 'taunt-3', countered: false },
      { id: 'taunt-2', countered: false },
      { id: 'taunt-3', countered: false },
    ]);
    expect(bonus).toBe(5);
  });
});

describe('scoreGame', () => {
  it('sums live values, cores, and combo', () => {
    const result = scoreGame({
      coresA: [{ id: 'guard-2', countered: false }],
      coresB: [{ id: 'taunt-3', countered: false }],
      rounds: [
        { cardA: 'strike-3', cardB: 'strike-2' },
        { cardA: 'taunt-2', cardB: 'taunt-3' },
        { cardA: 'powerup-1', cardB: 'powerup-2' },
        { cardA: 'guard-1', cardB: 'guard-2' },
        { cardA: 'powerup-2', cardB: 'powerup-1' },
      ],
    });
    // same types each round: no counters
    expect(result.log.every((l) => !l.counteredA && !l.counteredB)).toBe(true);
    expect(result.breakdown.A.cores).toBe(2);
    expect(result.breakdown.B.cores).toBe(3);
    expect(result.breakdown.A.played).toBe(3 + 2 + 1 + 1 + 2);
    // B's Power Up 2 in round 3 doubles Guard 2 in round 4 (2 → 4)
    expect(result.breakdown.B.played).toBe(2 + 3 + 2 + 4 + 1);
  });

  it('Strike counters a core and the core scores its low value', () => {
    const result = scoreGame({
      coresA: [{ id: 'taunt-3', countered: false }],
      coresB: [{ id: 'guard-1', countered: false }],
      rounds: [
        { cardA: 'strike-3', cardB: 'taunt-2', coreTargetsA: [0] },
        { cardA: 'powerup-1', cardB: 'powerup-2' },
        { cardA: 'guard-2', cardB: 'guard-1' },
        { cardA: 'taunt-3', cardB: 'strike-2' },
        { cardA: 'powerup-2', cardB: 'strike-3' },
      ],
    });
    // round 1: Strike vs Taunt — no type counter. Strike live, counters B's core.
    expect(result.log[0].counteredA).toBe(false);
    expect(result.coresB[0].countered).toBe(true);
    expect(result.breakdown.B.cores).toBe(1); // guard-1 countered value
  });

  it('Guard 2 uncounters a core', () => {
    const result = scoreGame({
      coresA: [{ id: 'strike-3', countered: true }],
      coresB: [{ id: 'taunt-3', countered: false }],
      rounds: [
        { cardA: 'guard-2', cardB: 'strike-2', uncounterA: 0 },
        { cardA: 'powerup-1', cardB: 'powerup-2' },
        { cardA: 'strike-2', cardB: 'strike-3' },
        { cardA: 'taunt-3', cardB: 'guard-1' },
        { cardA: 'powerup-2', cardB: 'guard-2' },
      ],
    });
    expect(result.coresA[0].countered).toBe(false);
    expect(result.breakdown.A.cores).toBe(3);
  });

  it('Guard 1 bonus is +2 per uncountered core if live', () => {
    const result = scoreGame({
      coresA: [
        { id: 'strike-3', countered: false },
        { id: 'taunt-3', countered: false },
      ],
      coresB: [{ id: 'powerup-2', countered: false }],
      rounds: [
        { cardA: 'guard-1', cardB: 'taunt-2' },
        { cardA: 'powerup-1', cardB: 'strike-2' },
        { cardA: 'strike-2', cardB: 'guard-2' },
        { cardA: 'taunt-2', cardB: 'powerup-1' },
        { cardA: 'powerup-2', cardB: 'guard-1' },
      ],
    });
    // Guard 1 vs Taunt 2: Taunt counters Guard, so Guard 1 is countered — no bonus
    expect(result.log[0].counteredA).toBe(true);
    expect(result.breakdown.A.effectNotes.join(' ')).not.toMatch(/Guard 1/);
  });

  it('live Guard 1 scores +2 per uncountered core', () => {
    const result = scoreGame({
      coresA: [
        { id: 'strike-3', countered: false },
        { id: 'taunt-3', countered: true },
      ],
      coresB: [{ id: 'powerup-2', countered: false }],
      rounds: [
        { cardA: 'guard-1', cardB: 'strike-2' },
        { cardA: 'powerup-1', cardB: 'taunt-2' },
        { cardA: 'strike-2', cardB: 'guard-2' },
        { cardA: 'taunt-2', cardB: 'powerup-1' },
        { cardA: 'powerup-2', cardB: 'guard-1' },
      ],
    });
    expect(result.log[0].counteredA).toBe(false);
    expect(result.breakdown.A.effectNotes.some((n) => n.startsWith('Guard 1: +2 × 1'))).toBe(
      true,
    );
  });

  it('Power Up 1 counts countered enemy plays and cores at end of game', () => {
    const result = scoreGame({
      coresA: [{ id: 'taunt-3', countered: false }],
      coresB: [{ id: 'guard-1', countered: true }],
      rounds: [
        { cardA: 'powerup-1', cardB: 'taunt-2' },
        { cardA: 'strike-3', cardB: 'powerup-2' },
        { cardA: 'guard-2', cardB: 'strike-2' },
        { cardA: 'taunt-2', cardB: 'guard-2' },
        { cardA: 'powerup-2', cardB: 'guard-1' },
      ],
    });
    // r2 Strike vs Power Up: Strike counters Power Up
    expect(result.log[1].counteredB).toBe(true);
    // r1 Power Up 1 vs Taunt 2: Power Up counters Taunt, Power Up 1 is live
    expect(result.log[0].counteredA).toBe(false);
    const notes = result.breakdown.A.effectNotes.join(' ');
    expect(notes).toMatch(/Power Up 1/);
    // enemy countered: at least the core (already) + powerup-2 play
    expect(result.breakdown.A.effects).toBeGreaterThanOrEqual(2);
  });

  it('Power Up 2 doubles only the next card, not cores', () => {
    const result = scoreGame({
      coresA: [{ id: 'guard-1', countered: false }],
      coresB: [{ id: 'taunt-3', countered: false }],
      rounds: [
        { cardA: 'powerup-2', cardB: 'strike-2' }, // strike counters powerup
        { cardA: 'strike-3', cardB: 'taunt-2' },
        { cardA: 'guard-2', cardB: 'guard-1' },
        { cardA: 'taunt-2', cardB: 'powerup-1' },
        { cardA: 'powerup-1', cardB: 'guard-2' },
      ],
    });
    expect(result.log[0].counteredA).toBe(true);
    expect(result.log[1].valueA).toBe(3);
  });

  it('is deterministic for the same sequences', () => {
    const input = {
      coresA: [{ id: 'guard-2' as const, countered: false }],
      coresB: [{ id: 'taunt-3' as const, countered: false }],
      rounds: [
        { cardA: 'strike-3' as const, cardB: 'powerup-1' as const, coreTargetsA: [0] },
        { cardA: 'taunt-2' as const, cardB: 'guard-1' as const },
        { cardA: 'powerup-2' as const, cardB: 'strike-2' as const },
        { cardA: 'guard-1' as const, cardB: 'taunt-2' as const },
        { cardA: 'powerup-1' as const, cardB: 'guard-2' as const },
      ],
    };
    const a = scoreGame(input);
    const b = scoreGame(input);
    expect(a.breakdown).toEqual(b.breakdown);
  });
});
