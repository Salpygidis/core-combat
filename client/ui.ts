import {
  TYPE_COLOR,
  TYPE_SHORT,
  comboProgress,
  def,
  FACTION_NAME,
  SEAT_FACTION,
} from '@shared/cards';
import type { CardId, CardType, PrivateMatchState, Seat, VisiblePlayed } from '@shared/types';
import type { LightId } from './table/scene';

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

export function button(label: string, onClick: () => void, kind: 'primary' | 'ghost' | 'gold' = 'primary'): HTMLButtonElement {
  const b = h('button', `btn btn-${kind}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

const LIGHT_SLIDERS: { id: LightId; label: string }[] = [
  { id: 'hemi', label: 'Hemi' },
  { id: 'key', label: 'Key' },
  { id: 'fill', label: 'Fill' },
];

export function renderSettings(
  parent: HTMLElement,
  lights: Record<LightId, number>,
  onLight: (id: LightId, value: number) => void,
): void {
  const wrap = h('aside', 'settings');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'settings-toggle';
  toggle.setAttribute('aria-label', 'Settings');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

  const menu = h('div', 'settings-menu');
  menu.hidden = true;
  menu.append(h('header', 'settings-head', 'Settings'));

  const lightsSection = h('section', 'settings-section');
  lightsSection.append(h('h3', 'settings-section-title', 'Lights'));
  for (const { id, label } of LIGHT_SLIDERS) {
    const row = h('label', 'settings-row');
    const name = h('span', 'settings-name', label);
    const value = h('span', 'settings-val', lights[id].toFixed(2));
    const input = document.createElement('input');
    input.className = 'settings-slider';
    input.type = 'range';
    input.min = '0';
    input.max = '4';
    input.step = '0.01';
    input.value = String(lights[id]);
    input.setAttribute('aria-label', `${label} light intensity`);
    input.addEventListener('input', () => {
      const n = Number(input.value);
      value.textContent = n.toFixed(2);
      onLight(id, n);
    });
    row.append(name, input, value);
    lightsSection.append(row);
  }
  menu.append(lightsSection);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') setOpen(false);
  };

  const setOpen = (open: boolean): void => {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    wrap.classList.toggle('open', open);
    if (open) window.addEventListener('keydown', onKey);
    else window.removeEventListener('keydown', onKey);
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });
  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  parent.addEventListener('pointerdown', () => {
    if (!menu.hidden) setOpen(false);
  });

  wrap.append(toggle, menu);
  parent.append(wrap);
}

export function renderHome(root: HTMLElement, actions: {
  onCreate(name: string): void;
  onJoin(code: string, name: string): void;
  onSpectate(code: string): void;
  onHotseat(): void;
  onBot(): void;
}): void {
  root.replaceChildren();
  const wrap = h('div', 'screen home');
  wrap.append(h('p', 'kicker', 'TWO FIGHTERS  ·  ONE TABLE'));
  wrap.append(h('h1', 'title', 'CORE COMBAT'));
  wrap.append(
    h(
      'p',
      'lede',
      'Park Cores. Play five. Counter the loop. First to win a game already holding three Cores takes the match.',
    ),
  );

  const name = h('input', 'field') as HTMLInputElement;
  name.placeholder = 'Your name (optional)';
  name.maxLength = 18;
  name.autocomplete = 'off';

  const code = h('input', 'field code-input') as HTMLInputElement;
  code.placeholder = 'ROOM CODE';
  code.maxLength = 6;
  code.autocapitalize = 'characters';
  code.addEventListener('input', () => {
    code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  const panel = h('div', 'panel');
  panel.append(name);
  panel.append(button('Play vs AI', () => actions.onBot(), 'gold'));
  panel.append(button('Create room', () => actions.onCreate(name.value)));
  panel.append(code);
  const row = h('div', 'row');
  row.append(button('Join room', () => actions.onJoin(code.value, name.value)));
  row.append(button('Join as spectator', () => actions.onSpectate(code.value), 'ghost'));
  panel.append(row);
  panel.append(button('Local hotseat (debug)', () => actions.onHotseat(), 'ghost'));
  wrap.append(panel);

  const loop = h('div', 'loop');
  loop.innerHTML =
    '<span class="t-taunt">Taunt</span> → <span class="t-guard">Guard</span> → <span class="t-strike">Strike</span> → <span class="t-power">Power Up</span> → Taunt';
  wrap.append(loop);
  wrap.append(
    h('p', 'muted', `${FACTION_NAME.coheed} plays as host (A)  ·  ${FACTION_NAME.cambria} plays as challenger (B)`),
  );
  root.append(wrap);
}

export function renderSeating(
  root: HTMLElement,
  state: PrivateMatchState,
  you: Seat | 'spectator' | 'hotseat',
  actions: { onStart(): void; onCopy(): void; onLeave(): void },
): void {
  root.replaceChildren();
  const wrap = h('div', 'screen seating');
  const head = h('div', 'seat-head');
  head.append(h('h2', '', 'Room'));
  const codeBtn = button(state.roomCode, actions.onCopy, 'gold');
  codeBtn.classList.add('code-pill');
  head.append(codeBtn);
  wrap.append(head);

  const grid = h('div', 'seat-grid');
  for (const seat of ['A', 'B'] as Seat[]) {
    const p = state.players[seat];
    const card = h('div', `seat-card ${p.present ? 'filled' : 'empty'}`);
    card.append(
      h(
        'div',
        'seat-label',
        seat === 'A'
          ? `Player A  ·  ${FACTION_NAME[SEAT_FACTION.A]}${state.hostSeat === 'A' ? '  ·  Host' : ''}`
          : `Player B  ·  ${FACTION_NAME[SEAT_FACTION.B]}${state.hostSeat === 'B' ? '  ·  Host' : ''}`,
      ),
    );
    card.append(h('div', 'seat-name', p.present ? p.name : 'Waiting…'));
    card.append(h('div', 'seat-conn', p.present ? (p.connected ? 'Connected' : 'Disconnected') : 'Open seat'));
    if ((you === seat) || (you === 'hotseat')) card.classList.add('yours');
    grid.append(card);
  }
  wrap.append(grid);
  wrap.append(h('p', 'muted', `${state.spectatorCount} spectator${state.spectatorCount === 1 ? '' : 's'}`));

  if (you === 'hotseat' || you === state.hostSeat) {
    const start = button('Start match', actions.onStart, 'gold');
    start.disabled = !state.players.A.present || !state.players.B.present;
    wrap.append(start);
  } else {
    wrap.append(h('p', 'lede', 'Waiting for the host to start.'));
  }
  wrap.append(button('Leave', actions.onLeave, 'ghost'));
  root.append(wrap);
}

export interface HudActions {
  onConfirm(): void;
  onAck(): void;
  onRematch(): void;
  onSwapSeats(): void;
  onCopy(): void;
}

export function renderHud(
  hud: HTMLElement,
  modal: HTMLElement,
  state: PrivateMatchState,
  opts: {
    you: Seat | 'spectator' | 'hotseat';
    controlling: Seat | null;
    targetCount: number;
    error: string | null;
    actions: HudActions;
  },
): void {
  hud.replaceChildren();
  const top = h('div', 'hud-top');
  const code = button(state.roomCode, opts.actions.onCopy, 'gold');
  code.classList.add('code-pill');
  top.append(code);
  top.append(h('div', 'chip', `Game ${state.gameNumber}`));
  if (state.phase === 'round_select' || state.phase === 'round_choice') {
    top.append(h('div', 'chip', `Round ${state.round} / 5`));
  }
  top.append(h('div', 'chip', `${state.spectatorCount} spec`));
  hud.append(top);

  const scores = h('div', 'hud-scores');
  for (const seat of ['A', 'B'] as Seat[]) {
    const p = state.players[seat];
    const box = h('div', `score-box ${opts.controlling === seat || state.you === seat ? 'mine' : ''}`);
    const name = h('div', 'score-name', `${p.name}${p.pendingDouble ? '  ·  NEXT ×2' : ''}`);
    box.append(name);
    const nums = h('div', 'score-nums');
    nums.append(h('span', '', `Match ${p.matchWins}`));
    nums.append(h('span', '', `Cores ${p.cores.length}`));
    nums.append(h('span', '', `Now ${runningScore(state, seat)}`));
    box.append(nums);
    if (!p.connected && p.present) box.append(h('div', 'warn', 'Disconnected'));
    scores.append(box);
  }
  hud.append(scores);
  hud.append(comboRail(state));

  const prompt = h('div', 'prompt', promptText(state, opts.you, opts.controlling));
  hud.append(prompt);

  const actions = h('div', 'hud-actions');
  const canAct = canPlayerAct(state, opts.you, opts.controlling);
  if (canAct && state.phase === 'round_choice' && state.choice) {
    const need = Math.min(state.choice.needed, state.choice.legal.length);
    const b = button(`Confirm (${opts.targetCount}/${need})`, opts.actions.onConfirm, 'gold');
    b.disabled = opts.targetCount !== need;
    actions.append(b);
  }
  if (state.phase === 'game_score' && canAct) {
    actions.append(button('Continue', opts.actions.onAck, 'gold'));
  }
  if (state.phase === 'match_over' && opts.you !== 'spectator') {
    actions.append(button('Swap seats', opts.actions.onSwapSeats, 'ghost'));
    if (opts.you === 'hotseat' || opts.you === state.hostSeat) {
      actions.append(button('Rematch', opts.actions.onRematch, 'gold'));
    }
  }
  if (actions.childNodes.length) hud.append(actions);

  if (opts.error) {
    const toast = h('div', 'toast', opts.error);
    hud.append(toast);
  }

  modal.replaceChildren();
  modal.classList.toggle('open', state.paused || state.phase === 'game_score' || state.phase === 'match_over');
  if (state.paused) {
    const pane = h('div', 'modal-pane');
    pane.append(h('h2', '', 'Waiting'));
    const names = state.waitingSeats.map((s) => state.players[s].name).join(', ');
    pane.append(h('p', '', `${names || 'A player'} disconnected. The match is frozen until they rejoin.`));
    pane.append(h('p', 'muted', 'Spectators stay. Reconnect with the same room code.'));
    modal.append(pane);
  } else if (state.phase === 'game_score' && state.scoreBreakdown) {
    modal.append(scorePane(state, opts.actions.onAck, canAct));
  } else if (state.phase === 'match_over') {
    const pane = h('div', 'modal-pane');
    const w = state.matchWinner;
    pane.append(h('h2', '', w ? `${state.players[w].name} wins the match` : 'Match over'));
    pane.append(h('p', '', `${state.players.A.name} ${state.matchWins.A}  —  ${state.matchWins.B} ${state.players.B.name}`));
    pane.append(
      h(
        'p',
        'muted',
        `${state.players.A.name} is ${FACTION_NAME[SEAT_FACTION.A]}  ·  ${state.players.B.name} is ${FACTION_NAME[SEAT_FACTION.B]}`,
      ),
    );
    const row = h('div', 'row');
    if (opts.you !== 'spectator') {
      row.append(button('Swap seats', opts.actions.onSwapSeats, 'ghost'));
    }
    if (opts.you === 'hotseat' || opts.you === state.hostSeat) {
      row.append(button('Rematch', opts.actions.onRematch, 'gold'));
    }
    if (row.childNodes.length) pane.append(row);
    modal.append(pane);
  }
}

function comboRail(state: PrivateMatchState): HTMLElement {
  const rail = h('div', 'combo-rail');
  for (const seat of ['A', 'B'] as Seat[]) {
    const faction = SEAT_FACTION[seat];
    const plays = state.players[seat].played
      .filter((s): s is VisiblePlayed => !!s && !s.hidden && s.id !== 'hidden')
      .map((s) => ({ id: s.id as CardId, countered: s.countered }));
    const lines = comboProgress(plays, faction);
    const side = h('section', `combo-side combo-${faction}`);
    if (lines.some((l) => l.matched > 0)) side.classList.add('hot');
    const head = h('header', 'combo-head', `${FACTION_NAME[faction]}  ·  ${state.players[seat].name}`);
    side.append(head);
    for (const line of lines) {
      side.append(comboLineEl(line));
    }
    rail.append(side);
  }
  return rail;
}

function comboLineEl(line: ReturnType<typeof comboProgress>[number]): HTMLElement {
  const row = h('div', `combo-line${line.complete ? ' complete' : line.matched > 0 ? ' active' : ''}`);
  const pips = h('div', 'combo-pips');
  line.pattern.types.forEach((type, i) => {
    const pip = h('span', 'pip');
    pip.style.background = TYPE_COLOR[type];
    if (i < line.matched) pip.classList.add('done');
    else if (!line.complete && i === line.matched) pip.classList.add('next');
    pip.textContent = TYPE_SHORT[type];
    pips.append(pip);
    if (i < line.pattern.types.length - 1) pips.append(h('span', 'pip-arrow', '→'));
  });
  row.append(pips);
  const pts = h('span', 'combo-pts', `+${line.pattern.bonus}`);
  row.append(pts);
  if (line.next) {
    row.append(h('div', 'combo-hint', `Next: ${typeHint(line.next)}`));
  } else if (line.complete) {
    row.append(h('div', 'combo-hint', 'Combo locked'));
  }
  return row;
}

function typeHint(type: CardType): string {
  if (type === 'powerup') return 'Power Up';
  if (type === 'strike') return 'Strike';
  if (type === 'guard') return 'Guard';
  return 'Taunt';
}

function canPlayerAct(
  state: PrivateMatchState,
  you: Seat | 'spectator' | 'hotseat',
  controlling: Seat | null,
): boolean {
  if (state.paused) return false;
  if (you === 'spectator') return false;
  const seat = you === 'hotseat' ? controlling : you;
  if (!seat) return false;
  return state.waitingSeats.includes(seat);
}

function promptText(
  state: PrivateMatchState,
  you: Seat | 'spectator' | 'hotseat',
  controlling: Seat | null,
): string {
  if (state.paused) return 'Match frozen — waiting for reconnect';
  const seat = you === 'hotseat' ? controlling : you === 'spectator' ? null : you;
  const names = (seats: Seat[]) => seats.map((s) => state.players[s].name).join(' & ');
  switch (state.phase) {
    case 'seating':
      return 'Seating';
    case 'core_select':
      return seat && state.waitingSeats.includes(seat)
        ? 'Drag 1 card onto your Core space — hidden until both play'
        : `Waiting for ${names(state.waitingSeats)} to play a Core`;
    case 'round_select':
      return seat && state.waitingSeats.includes(seat)
        ? `Round ${state.round}: drag a card onto the highlighted space`
        : `Waiting for ${names(state.waitingSeats)} to play`;
    case 'round_choice': {
      const c = state.choice;
      if (!c) return 'Resolving…';
      const verb = c.kind === 'counter-cores' ? 'enemy Core(s) to counter' : 'Core to uncounter';
      return c.seat === seat ? `Choose ${c.needed} ${verb}` : `${state.players[c.seat].name} is choosing`;
    }
    case 'game_score':
      return 'Game scored';
    case 'winner_core':
      return seat && state.waitingSeats.includes(seat)
        ? 'You won. Drag 1 card onto your Core row'
        : `${names(state.waitingSeats)} is parking a Core`;
    case 'match_over':
      return 'Match over';
  }
}

function runningScore(state: PrivateMatchState, seat: Seat): number {
  if (state.phase === 'game_score' || state.phase === 'match_over' || state.phase === 'winner_core') {
    return state.scoreBreakdown?.[seat].total ?? 0;
  }
  const p = state.players[seat];
  let n = 0;
  for (const c of p.cores) {
    if (c.hidden || c.id === 'hidden') continue;
    n += c.countered ? def(c.id).countered : def(c.id).live;
  }
  for (const s of p.played) {
    if (!s || s.hidden || s.id === 'hidden') continue;
    n += s.value;
  }
  return n;
}

function scorePane(state: PrivateMatchState, onAck: () => void, canAct: boolean): HTMLElement {
  const pane = h('div', 'modal-pane wide');
  const br = state.scoreBreakdown!;
  const title =
    br.winner === 'tie' ? 'Draw' : `${state.players[br.winner].name} wins the game`;
  pane.append(h('h2', '', title));
  const grid = h('div', 'breakdown');
  for (const seat of ['A', 'B'] as Seat[]) {
    const line = br[seat];
    const col = h('div', 'break-col');
    col.append(h('h3', '', state.players[seat].name));
    col.append(rowLine('Played', line.played));
    col.append(rowLine('Cores', line.cores));
    col.append(rowLine('Effects', line.effects));
    col.append(rowLine('Combo', line.combo));
    col.append(rowLine('Total', line.total, true));
    if (line.comboNote) col.append(h('p', 'note', line.comboNote));
    for (const n of line.effectNotes) col.append(h('p', 'note', n));
    grid.append(col);
  }
  pane.append(grid);
  if (canAct) pane.append(button('Continue', onAck, 'gold'));
  else pane.append(h('p', 'muted', 'Waiting for both players to continue'));
  return pane;
}

function rowLine(label: string, n: number, strong = false): HTMLElement {
  const row = h('div', strong ? 'br-row total' : 'br-row');
  row.append(h('span', '', label));
  row.append(h('span', '', String(n)));
  return row;
}


