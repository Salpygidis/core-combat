import { botIntent } from '@shared/bot';
import { FACTION_NAME, SEAT_FACTION } from '@shared/cards';
import { Match } from '@shared/match';
import type { CardId, Intent, PrivateMatchState, Seat } from '@shared/types';
import { opponent } from '@shared/types';
import {
  clearSession,
  connectNet,
  loadSession,
  saveSession,
  type Joined,
} from './net';
import { GameTable, type DropSlot } from './table/scene';
import { h, renderHome, renderHud, renderSettings, renderSeating } from './ui';

export class App {
  private root: HTMLElement;
  private net = connectNet({
    onJoined: (info) => this.onJoined(info),
    onState: (state) => this.onNetState(state),
    onError: (message) => this.flash(message),
  });
  private mode: 'home' | 'net' | 'hotseat' | 'bot' = 'home';
  private role: Seat | 'spectator' = 'spectator';
  private state: PrivateMatchState | null = null;
  private match: Match | null = null;
  private controlling: Seat = 'A';
  private table: GameTable | null = null;
  private gameRoot: HTMLElement | null = null;
  private hud: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private peek: HTMLElement | null = null;
  private peekImg: HTMLImageElement | null = null;
  private targets: number[] = [];
  private choiceKey = '';
  private error: string | null = null;
  private errorTimer = 0;
  private botTimer = 0;
  private humanSeat: Seat = 'A';
  private botSeat: Seat = 'B';

  constructor(root: HTMLElement) {
    this.root = root;
    this.showHome();
    const session = loadSession();
    if (session) {
      this.net.reconnect(session.code, session.seat, session.token);
    }
  }

  private showHome(): void {
    this.mode = 'home';
    this.table = null;
    this.match = null;
    this.gameRoot = null;
    this.state = null;
    window.clearTimeout(this.botTimer);
    clearSession();
    renderHome(this.root, {
      onCreate: (name) => this.net.createRoom(name),
      onJoin: (code, name) => {
        if (!code.trim()) return this.flash('Enter a room code');
        this.net.joinRoom(code, name);
      },
      onSpectate: (code) => {
        if (!code.trim()) return this.flash('Enter a room code');
        this.net.spectate(code);
      },
      onHotseat: () => this.startHotseat(),
      onBot: () => this.startBot(),
    });
  }

  private startHotseat(): void {
    const match = new Match('HOTS');
    match.occupy('A', 'Player A', 'local-a');
    match.occupy('B', 'Player B', 'local-b');
    match.apply('A', { type: 'startMatch' });
    this.mode = 'hotseat';
    this.match = match;
    this.controlling = 'A';
    this.role = 'A';
    this.ensureGame();
    this.table?.setView('hotseat');
    this.pullHotseat();
  }

  private startBot(): void {
    const match = new Match('VS AI');
    match.occupy('A', 'You', 'local-a');
    match.occupy('B', 'Cambria AI', 'local-b');
    match.apply('A', { type: 'startMatch' });
    this.mode = 'bot';
    this.match = match;
    this.controlling = 'A';
    this.role = 'A';
    this.humanSeat = 'A';
    this.botSeat = 'B';
    this.ensureGame();
    this.table?.setView('A');
    this.pullLocal();
  }

  private onJoined(info: Joined): void {
    this.mode = 'net';
    this.role = info.role;
    if (info.role !== 'spectator' && info.token) {
      saveSession(info.code, info.role, info.token);
    }
  }

  private onNetState(state: PrivateMatchState): void {
    this.state = state;
    if (state.phase === 'seating') {
      this.renderSeating();
      return;
    }
    this.ensureGame();
    this.table?.setView(this.role === 'spectator' ? 'spectator' : this.role);
    this.paint();
  }

  private pullHotseat(): void {
    if (!this.match) return;
    const wait = this.match.waitingSeats();
    if (wait.length && !wait.includes(this.controlling)) this.controlling = wait[0];
    this.state = this.match.getPrivateState(this.controlling);
    this.paint();
  }

  private pullLocal(): void {
    if (!this.match) return;
    this.state = this.match.getPrivateState(this.humanSeat);
    this.paint();
    this.queueBot();
  }

  private renderSeating(): void {
    if (!this.state) return;
    this.gameRoot = null;
    this.table = null;
    renderSeating(this.root, this.state, this.role, {
      onStart: () => this.act({ type: 'startMatch' }),
      onCopy: () => this.copyCode(),
      onLeave: () => {
        this.net.socket.disconnect();
        this.net.socket.connect();
        this.showHome();
      },
    });
  }

  private ensureGame(): void {
    if (this.gameRoot) return;
    this.root.replaceChildren();
    const game = h('div', 'game');
    const canvas = document.createElement('canvas');
    const hud = h('div', '');
    hud.id = 'hud';
    const modal = h('div', '');
    modal.id = 'modal';
    const peek = h('aside', 'card-peek');
    peek.hidden = true;
    const peekImg = document.createElement('img');
    peekImg.alt = '';
    peek.append(peekImg);
    game.append(canvas, hud, peek, modal);
    this.root.append(game);
    this.gameRoot = game;
    this.hud = hud;
    this.modal = modal;
    this.peek = peek;
    this.peekImg = peekImg;
    this.table = new GameTable(canvas, {
      onPlay: (_seat, cardId) => this.playHand(cardId),
      onCore: (_owner, index) => this.pickCore(index),
      onInspect: (id) => this.showPeek(id),
    });
    renderSettings(game, this.table.getLightIntensities(), (id, value) => {
      this.table?.setLightIntensity(id, value);
    });
  }

  private paint(): void {
    const state = this.state;
    if (!state || !this.hud || !this.modal || !this.table) return;

    if (this.mode === 'hotseat' || this.mode === 'bot') {
      let flag = this.gameRoot?.querySelector('.hotseat-flag') as HTMLElement | null;
      if (!flag && this.gameRoot) {
        flag = h('div', 'hotseat-flag');
        this.gameRoot.append(flag);
      }
      if (flag) {
        flag.textContent =
          this.mode === 'bot'
            ? `VS AI  ·  ${FACTION_NAME[SEAT_FACTION[this.botSeat]].toUpperCase()}`
            : `HOTSEAT  ·  ${this.controlling}`;
      }
    }

    const choiceKey = state.choice
      ? `${state.round}:${state.choice.seat}:${state.choice.kind}`
      : '';
    if (choiceKey !== this.choiceKey) {
      this.choiceKey = choiceKey;
      this.targets = [];
    }

    const you = this.mode === 'hotseat' ? 'hotseat' : this.role;
    const selectedKey =
      you === 'hotseat'
        ? this.match?.players[this.controlling].selection
          ? `hand:${this.controlling}:${this.match.players[this.controlling].selection}`
          : null
        : state.mySelection
          ? `hand:${state.you}:${state.mySelection}`
          : null;

    const extra =
      this.mode === 'hotseat' && this.match
        ? {
            hands: {
              A: this.match.players.A.hand,
              B: this.match.players.B.hand,
            } as Record<Seat, CardId[]>,
            selections: {
              A: this.match.players.A.selection,
              B: this.match.players.B.selection,
            } as Record<Seat, CardId | null>,
          }
        : null;

    const interactSeat = you === 'hotseat' ? this.controlling : you === 'spectator' ? null : you;
    const waiting = interactSeat !== null && state.waitingSeats.includes(interactSeat);

    const drops = dropSlots(state, interactSeat, waiting);
    if (waiting && (state.phase === 'core_select' || state.phase === 'round_select' || state.phase === 'winner_core') && interactSeat) {
      this.table.setInteract({ mode: 'hand', seat: interactSeat }, selectedKey, [], drops);
    } else if (waiting && state.phase === 'round_choice' && state.choice && interactSeat === state.choice.seat) {
      const owner = state.choice.kind === 'counter-cores' ? (state.choice.seat === 'A' ? 'B' : 'A') : state.choice.seat;
      this.table.setInteract(
        { mode: 'cores', owner, legal: state.choice.legal },
        selectedKey,
        this.targets.map((i) => `core:${owner}:${i}`),
        drops,
      );
    } else {
      this.table.setInteract({ mode: 'none' }, selectedKey, [], drops);
    }

    this.table.sync(state, extra);

    renderHud(this.hud, this.modal, state, {
      you,
      controlling: this.mode === 'hotseat' ? this.controlling : null,
      targetCount: this.targets.length,
      error: this.error,
      actions: {
        onConfirm: () => this.confirmTargets(),
        onAck: () => this.act({ type: 'ackScore' }),
        onRematch: () => this.act({ type: 'rematch' }),
        onSwapSeats: () => this.swapSeats(),
        onCopy: () => this.copyCode(),
      },
    });
  }

  private showPeek(id: string | null): void {
    if (!this.peek || !this.peekImg) return;
    if (!id) {
      this.peek.hidden = true;
      this.peekImg.removeAttribute('src');
      return;
    }
    const img = this.peekImg;
    img.onerror = () => {
      img.onerror = null;
      if (!img.src.endsWith('.jpg')) img.src = `/cards/${id}.jpg`;
    };
    img.alt = id;
    img.src = `/cards/${id}.png`;
    this.peek.hidden = false;
  }

  private playHand(cardId: CardId): void {
    const phase = this.state?.phase;
    if (phase === 'core_select') this.act({ type: 'playCore', cardId });
    else if (phase === 'winner_core') this.act({ type: 'playWinnerCore', cardId });
    else if (phase === 'round_select') this.act({ type: 'playCard', cardId });
  }

  private pickCore(index: number): void {
    const choice = this.state?.choice;
    if (!choice) return;
    if (!choice.legal.includes(index)) return;
    const need = Math.min(choice.needed, choice.legal.length);
    if (this.targets.includes(index)) {
      this.targets = this.targets.filter((i) => i !== index);
    } else if (this.targets.length < need) {
      this.targets = [...this.targets, index];
    }
    this.paint();
  }

  private confirmTargets(): void {
    this.act({ type: 'chooseTargets', indices: this.targets });
    this.targets = [];
  }

  private act(intent: Intent): void {
    if (this.mode === 'hotseat' && this.match) {
      const result = this.match.apply(this.controlling, intent);
      if (!result.ok) this.flash(result.error ?? 'Illegal action');
      this.targets = [];
      this.pullHotseat();
      return;
    }
    if (this.mode === 'bot' && this.match) {
      const result = this.match.apply(this.humanSeat, intent);
      if (!result.ok) this.flash(result.error ?? 'Illegal action');
      this.targets = [];
      this.pullLocal();
      return;
    }
    this.net.send(intent);
  }

  private queueBot(): void {
    if (this.mode !== 'bot' || !this.match) return;
    window.clearTimeout(this.botTimer);
    if (!this.match.waitingSeats().includes(this.botSeat)) return;
    this.botTimer = window.setTimeout(() => this.stepBot(), this.botDelay());
  }

  private botDelay(): number {
    if (!this.match) return 600;
    const phase = this.match.phase;
    const bot = this.match.players[this.botSeat];
    if (phase === 'round_choice') return 1100;
    if (phase === 'game_score') return 900;
    if (phase === 'winner_core') return bot.selection ? 420 : 800;
    if ((phase === 'core_select' || phase === 'round_select') && bot.selection && !bot.locked) {
      return 380;
    }
    return 700;
  }

  private stepBot(): void {
    if (this.mode !== 'bot' || !this.match) return;
    if (!this.match.waitingSeats().includes(this.botSeat)) return;
    const intent = botIntent(this.match, this.botSeat);
    if (!intent) return;
    const result = this.match.apply(this.botSeat, intent);
    if (!result.ok) this.flash(result.error ?? 'AI could not move');
    this.pullLocal();
  }

  private swapSeats(): void {
    if (this.mode === 'bot' && this.match) {
      const result = this.match.apply(this.humanSeat, { type: 'swapSeats' });
      if (!result.ok) {
        this.flash(result.error ?? 'Could not swap seats');
        return;
      }
      this.humanSeat = opponent(this.humanSeat);
      this.botSeat = opponent(this.botSeat);
      this.role = this.humanSeat;
      this.controlling = this.humanSeat;
      this.match.players[this.botSeat].name = `${FACTION_NAME[SEAT_FACTION[this.botSeat]]} AI`;
      this.table?.setView(this.humanSeat);
      this.pullLocal();
      return;
    }
    this.act({ type: 'swapSeats' });
  }

  private copyCode(): void {
    const code = this.state?.roomCode;
    if (!code) return;
    void navigator.clipboard?.writeText(code);
    this.flash(`Copied ${code}`);
  }

  private flash(message: string): void {
    this.error = message;
    window.clearTimeout(this.errorTimer);
    this.errorTimer = window.setTimeout(() => {
      this.error = null;
      if (this.mode === 'home') {
        const toast = this.root.querySelector('.toast');
        toast?.remove();
        const t = h('div', 'toast', message);
        this.root.append(t);
        window.setTimeout(() => t.remove(), 2400);
        return;
      }
      this.paint();
    }, 2400);
    if (this.mode === 'home') {
      const existing = this.root.querySelector('.toast');
      existing?.remove();
      this.root.append(h('div', 'toast', message));
      return;
    }
    this.paint();
  }
}

function dropSlots(
  state: PrivateMatchState,
  interactSeat: Seat | null,
  waiting: boolean,
): DropSlot[] {
  const drops: DropSlot[] = [];
  if (state.phase === 'round_select') {
    const index = state.round - 1;
    for (const seat of ['A', 'B'] as Seat[]) {
      if (state.players[seat].played[index]) continue;
      drops.push({
        kind: 'play',
        seat,
        index,
        accept: waiting && interactSeat === seat,
      });
    }
  } else if (state.phase === 'core_select') {
    for (const seat of ['A', 'B'] as Seat[]) {
      if (state.players[seat].cores.length > 0) continue;
      drops.push({
        kind: 'core',
        seat,
        index: 0,
        accept: waiting && interactSeat === seat,
      });
    }
  } else if (state.phase === 'winner_core') {
    const winner = state.scoreBreakdown?.winner;
    if (winner === 'A' || winner === 'B') {
      drops.push({
        kind: 'core',
        seat: winner,
        index: state.players[winner].cores.length,
        accept: waiting && interactSeat === winner,
      });
    }
  }
  return drops;
}
