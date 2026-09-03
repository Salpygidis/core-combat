import { Match } from '@shared/match';
import type { CardId, Intent, PrivateMatchState, Seat } from '@shared/types';
import {
  clearSession,
  connectNet,
  loadSession,
  saveSession,
  type Joined,
} from './net';
import { GameTable } from './table/scene';
import { h, renderHome, renderHud, renderSeating } from './ui';

export class App {
  private root: HTMLElement;
  private net = connectNet({
    onJoined: (info) => this.onJoined(info),
    onState: (state) => this.onNetState(state),
    onError: (message) => this.flash(message),
  });
  private mode: 'home' | 'net' | 'hotseat' = 'home';
  private role: Seat | 'spectator' = 'spectator';
  private state: PrivateMatchState | null = null;
  private match: Match | null = null;
  private controlling: Seat = 'A';
  private table: GameTable | null = null;
  private gameRoot: HTMLElement | null = null;
  private hud: HTMLElement | null = null;
  private modal: HTMLElement | null = null;
  private targets: number[] = [];
  private choiceKey = '';
  private error: string | null = null;
  private errorTimer = 0;

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
    game.append(canvas, hud, modal);
    this.root.append(game);
    this.gameRoot = game;
    this.hud = hud;
    this.modal = modal;
    this.table = new GameTable(canvas, {
      onHand: (_seat, cardId) => this.pickHand(cardId),
      onCore: (_owner, index) => this.pickCore(index),
    });
  }

  private paint(): void {
    const state = this.state;
    if (!state || !this.hud || !this.modal || !this.table) return;

    if (this.mode === 'hotseat') {
      let flag = this.gameRoot?.querySelector('.hotseat-flag') as HTMLElement | null;
      if (!flag && this.gameRoot) {
        flag = h('div', 'hotseat-flag');
        this.gameRoot.append(flag);
      }
      if (flag) flag.textContent = `HOTSEAT  ·  ${this.controlling}`;
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

    if (waiting && (state.phase === 'core_select' || state.phase === 'round_select' || state.phase === 'winner_core') && interactSeat) {
      this.table.setInteract({ mode: 'hand', seat: interactSeat }, selectedKey, []);
    } else if (waiting && state.phase === 'round_choice' && state.choice && interactSeat === state.choice.seat) {
      const owner = state.choice.kind === 'counter-cores' ? (state.choice.seat === 'A' ? 'B' : 'A') : state.choice.seat;
      this.table.setInteract(
        { mode: 'cores', owner, legal: state.choice.legal },
        selectedKey,
        this.targets.map((i) => `core:${owner}:${i}`),
      );
    } else {
      this.table.setInteract({ mode: 'none' }, selectedKey, []);
    }

    this.table.sync(state, extra);

    renderHud(this.hud, this.modal, state, {
      you,
      controlling: this.mode === 'hotseat' ? this.controlling : null,
      targetCount: this.targets.length,
      error: this.error,
      actions: {
        onLock: () => this.lock(),
        onConfirm: () => this.confirmTargets(),
        onAck: () => this.act({ type: 'ackScore' }),
        onRematch: () => this.act({ type: 'rematch' }),
        onCopy: () => this.copyCode(),
      },
    });
  }

  private pickHand(cardId: CardId): void {
    const state = this.state;
    if (!state) return;
    if (state.phase === 'core_select') this.act({ type: 'selectCore', cardId });
    else if (state.phase === 'winner_core') this.act({ type: 'selectWinnerCore', cardId });
    else if (state.phase === 'round_select') this.act({ type: 'selectCard', cardId });
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

  private lock(): void {
    const phase = this.state?.phase;
    if (phase === 'core_select') this.act({ type: 'lockCore' });
    else if (phase === 'winner_core') this.act({ type: 'lockWinnerCore' });
    else if (phase === 'round_select') this.act({ type: 'lockCard' });
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
    this.net.send(intent);
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
