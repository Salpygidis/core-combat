import { def } from '@shared/cards';
import type { PrivateMatchState, Seat } from '@shared/types';

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

export function renderHome(root: HTMLElement, actions: {
  onCreate(name: string): void;
  onJoin(code: string, name: string): void;
  onSpectate(code: string): void;
  onHotseat(): void;
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
  panel.append(button('Create room', () => actions.onCreate(name.value), 'gold'));
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
    card.append(h('div', 'seat-label', seat === 'A' ? 'Player A  ·  Host' : 'Player B'));
    card.append(h('div', 'seat-name', p.present ? p.name : 'Waiting…'));
    card.append(h('div', 'seat-conn', p.present ? (p.connected ? 'Connected' : 'Disconnected') : 'Open seat'));
    if ((you === seat) || (you === 'hotseat')) card.classList.add('yours');
    grid.append(card);
  }
  wrap.append(grid);
  wrap.append(h('p', 'muted', `${state.spectatorCount} spectator${state.spectatorCount === 1 ? '' : 's'}`));

  if (you === 'A' || you === 'hotseat') {
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
  onLock(): void;
  onConfirm(): void;
  onAck(): void;
  onRematch(): void;
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

  const prompt = h('div', 'prompt', promptText(state, opts.you, opts.controlling));
  hud.append(prompt);

  const actions = h('div', 'hud-actions');
  const canAct = canPlayerAct(state, opts.you, opts.controlling);
  if (canAct && (state.phase === 'core_select' || state.phase === 'winner_core' || state.phase === 'round_select')) {
    const label = state.phase === 'round_select' ? 'Lock card' : 'Lock Core';
    const b = button(label, opts.actions.onLock, 'gold');
    const locked = opts.you === 'hotseat'
      ? opts.controlling
        ? state.players[opts.controlling].locked
        : true
      : state.myLocked;
    const selected = opts.you === 'hotseat'
      ? opts.controlling
        ? state.players[opts.controlling].selected
        : false
      : state.mySelection !== null;
    b.disabled = locked || !selected;
    actions.append(b);
  }
  if (canAct && state.phase === 'round_choice' && state.choice) {
    const need = Math.min(state.choice.needed, state.choice.legal.length);
    const b = button(`Confirm (${opts.targetCount}/${need})`, opts.actions.onConfirm, 'gold');
    b.disabled = opts.targetCount !== need;
    actions.append(b);
  }
  if (state.phase === 'game_score' && canAct) {
    actions.append(button('Continue', opts.actions.onAck, 'gold'));
  }
  if (state.phase === 'match_over' && (opts.you === 'A' || opts.you === 'hotseat')) {
    actions.append(button('Rematch', opts.actions.onRematch, 'gold'));
  }
  hud.append(actions);

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
    if (opts.you === 'A' || opts.you === 'hotseat') {
      pane.append(button('Rematch', opts.actions.onRematch, 'gold'));
    }
    modal.append(pane);
  }
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
        ? 'Pick 1 card as your Core — hidden until both lock'
        : `Waiting for ${names(state.waitingSeats)} to lock a Core`;
    case 'round_select':
      return seat && state.waitingSeats.includes(seat)
        ? `Round ${state.round}: pick 1 card from your hand`
        : `Waiting for ${names(state.waitingSeats)} to lock`;
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
        ? 'You won. Park 1 more Core (hidden until you confirm)'
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


