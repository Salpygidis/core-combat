import * as THREE from 'three';
import { CARD_DEFS, FACTION_COLOR, SEAT_FACTION } from '@shared/cards';
import type { CardId, PrivateMatchState, Seat } from '@shared/types';
import {
  CardMesh,
  CARD_H,
  CARD_T,
  easeInCubic,
  easeOutCubic,
  typeColor,
  type CardTarget,
} from './cardMesh';
import { drawFelt, type FaceId } from './textures';

export type Interact =
  | { mode: 'none' }
  | { mode: 'hand'; seat: Seat }
  | { mode: 'cores'; owner: Seat; legal: number[] };

export interface HotseatExtra {
  hands: Record<Seat, CardId[]>;
  selections: Record<Seat, CardId | null>;
}

export interface TablePicks {
  onHand(seat: Seat, cardId: CardId): void;
  onCore(owner: Seat, index: number): void;
  onInspect(id: FaceId | null): void;
}

export type LightId = 'hemi' | 'key' | 'fill';

// Table geography (A is +Z). Combat rows sit just across center so each
// play lands directly above the opponent's card; cores sit in front of
// their owner; remaining hand is nearest the player.
const ROW = CARD_H + 0.22;
const PLAY_Z: Record<Seat, number> = { A: ROW * 0.5, B: -ROW * 0.5 };
const CORE_Z: Record<Seat, number> = { A: PLAY_Z.A + ROW, B: PLAY_Z.B - ROW };
const HAND_Z: Record<Seat, number> = { A: CORE_Z.A + ROW, B: CORE_Z.B - ROW };
const COMBO_X = -4.55;

export class GameTable {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private cards = new Map<string, CardMesh>();
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private interact: Interact = { mode: 'none' };
  private hoverKey: string | null = null;
  private inspectId: FaceId | null = null;
  private selectedKey: string | null = null;
  private targetCores = new Set<string>();
  private viewSeat: Seat | 'spectator' | 'hotseat' = 'A';
  private clock = new THREE.Clock();
  private picks: TablePicks;
  private revealedPlays = new Set<string>();
  private hemi: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private fill: THREE.DirectionalLight;

  constructor(canvas: HTMLCanvasElement, picks: TablePicks) {
    this.picks = picks;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x120b08, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x120b08, 18, 36);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    this.setView('A');

    this.hemi = new THREE.HemisphereLight(0xfff1d6, 0x1a120c, 2.00);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffe6c2, 1.60);
    this.key.position.set(4, 14, 8);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.left = -10;
    this.key.shadow.camera.right = 10;
    this.key.shadow.camera.top = 8;
    this.key.shadow.camera.bottom = -8;
    this.scene.add(this.key);
    this.fill = new THREE.DirectionalLight(0x88aacc, 0.90);
    this.fill.position.set(-8, 6, -4);
    this.scene.add(this.fill);

    const railMat = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.7, metalness: 0.05 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.45, 12.0), railMat);
    table.position.y = -0.28;
    table.receiveShadow = true;
    this.scene.add(table);

    const feltMat = new THREE.MeshStandardMaterial({
      map: drawFelt(),
      color: 0x8aa686,
      roughness: 0.92,
      metalness: 0,
    });
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(15.2, 10.6), feltMat);
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0;
    felt.receiveShadow = true;
    this.scene.add(felt);

    const inlay = new THREE.Mesh(
      new THREE.PlaneGeometry(14.4, 9.9),
      new THREE.MeshStandardMaterial({ color: 0x0f1a12, roughness: 0.95, transparent: true, opacity: 0.35 }),
    );
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.y = 0.005;
    this.scene.add(inlay);

    canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
    canvas.addEventListener('pointermove', (e) => this.onHover(e));
    canvas.addEventListener('pointerleave', () => this.clearInspect());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  getLightIntensities(): Record<LightId, number> {
    return { hemi: this.hemi.intensity, key: this.key.intensity, fill: this.fill.intensity };
  }

  setLightIntensity(id: LightId, value: number): void {
    this[id].intensity = value;
  }

  /** Cards face their owner so combat stays head-to-head. */
  private ownerYaw(seat: Seat): number {
    return seat === 'A' ? 0 : Math.PI;
  }

  private cardYaw(seat: Seat, countered = false): number {
    return this.ownerYaw(seat) + (countered ? Math.PI : 0);
  }

  setView(view: Seat | 'spectator' | 'hotseat'): void {
    this.viewSeat = view;
    this.applyCamera();
  }

  private applyCamera(): void {
    const narrow = this.camera.aspect > 0 && this.camera.aspect < 0.85;
    this.camera.fov = narrow ? 50 : 38;
    const view = this.viewSeat;
    if (view === 'hotseat' || view === 'spectator') {
      this.camera.position.set(0, narrow ? 18 : 16.5, narrow ? 12 : 10.5);
      this.camera.lookAt(0, 0, 0.4);
    } else if (view === 'A') {
      this.camera.position.set(0, narrow ? 14.5 : 12.8, narrow ? 13.2 : 11.6);
      this.camera.lookAt(0, 0, 0.6);
    } else {
      this.camera.position.set(0, narrow ? 14.5 : 12.8, narrow ? -13.2 : -11.6);
      this.camera.lookAt(0, 0, -0.6);
    }
    this.camera.updateProjectionMatrix();
  }

  setInteract(interact: Interact, selectedKey: string | null, targetCores: string[]): void {
    this.interact = interact;
    this.selectedKey = selectedKey;
    this.targetCores = new Set(targetCores);
  }

  sync(state: PrivateMatchState, extra: HotseatExtra | null): void {
    const seen = new Set<string>();
    const justRevealed = new Set<string>();
    const createdPlays = new Set<string>();

    for (const seat of ['A', 'B'] as Seat[]) {
      const player = state.players[seat];
      const faceUpHand =
        extra !== null || (state.you === seat);
      const hand = extra ? extra.hands[seat] : state.you === seat ? state.hand : [];
      const selection = extra ? extra.selections[seat] : state.you === seat ? state.mySelection : null;

      if (faceUpHand) {
        hand.forEach((id, i) => {
          const key = `hand:${seat}:${id}`;
          seen.add(key);
          const { mesh, created } = this.ensure(key, id);
          mesh.meta = { kind: 'hand', seat, index: i, cardId: id };
          mesh.selectable = this.interact.mode === 'hand' && this.interact.seat === seat;
          const pos = spread(hand.length, i, 1.28);
          mesh.target = {
            x: pos,
            y: CARD_T / 2 + 0.02,
            z: HAND_Z[seat],
            rotX: 0,
            rotY: this.ownerYaw(seat),
            rotZ: 0,
            scale: selection === id ? 1.06 : 1,
          };
          if (selection === id) mesh.target.y = 0.28;
          void mesh.setFace(id, typeColor(CARD_DEFS[id].type));
          if (created) mesh.snap();
        });
      } else {
        for (let i = 0; i < player.handCount; i++) {
          const key = `handback:${seat}:${i}`;
          seen.add(key);
          const { mesh, created } = this.ensure(key, 'back');
          mesh.meta = { kind: 'hand', seat, index: i };
          mesh.selectable = false;
          mesh.target = {
            x: spread(player.handCount, i, 1.05),
            y: CARD_T / 2 + 0.02,
            z: HAND_Z[seat],
            rotX: Math.PI,
            rotY: this.ownerYaw(seat),
            rotZ: 0,
            scale: 1,
          };
          void mesh.setFace('back');
          if (created) mesh.snap();
        }
      }

      player.played.forEach((slot, i) => {
        if (!slot) return;
        const key = `play:${seat}:${i}`;
        seen.add(key);
        const id = slot.id === 'hidden' ? 'back' : slot.id;
        const { mesh, created } = this.ensure(key, id);
        mesh.meta = { kind: 'play', seat, index: i, cardId: slot.id === 'hidden' ? undefined : slot.id };
        mesh.selectable = false;
        const hidden = slot.hidden || slot.id === 'hidden';
        mesh.target = {
          x: spread(5, i, 1.38),
          y: CARD_T / 2 + 0.03,
          z: PLAY_Z[seat],
          rotX: hidden ? Math.PI : 0,
          rotY: this.cardYaw(seat, !hidden && slot.countered),
          rotZ: 0,
          scale: 1,
        };
        if (hidden) void mesh.setFace('back');
        else if (slot.id !== 'hidden') void mesh.setFace(slot.id, typeColor(CARD_DEFS[slot.id].type));
        if (created) {
          createdPlays.add(key);
          if (!hidden) {
            // Park face-down so a pair-knock can flip both together.
            mesh.target = { ...mesh.target, rotX: Math.PI, rotY: this.ownerYaw(seat) };
            mesh.snap();
            mesh.target.rotX = 0;
            mesh.target.rotY = this.cardYaw(seat, slot.countered);
            this.revealedPlays.add(key);
            justRevealed.add(key);
          } else {
            mesh.snap();
          }
        } else if (!hidden && !this.revealedPlays.has(key)) {
          this.revealedPlays.add(key);
          justRevealed.add(key);
        }
      });

      player.cores.forEach((core, i) => {
        const key = `core:${seat}:${i}`;
        seen.add(key);
        const id = core.id === 'hidden' ? 'back' : core.id;
        const { mesh, created } = this.ensure(key, id);
        mesh.meta = { kind: 'core', seat, index: i, cardId: core.id === 'hidden' ? undefined : core.id };
        const legal =
          this.interact.mode === 'cores' &&
          this.interact.owner === seat &&
          this.interact.legal.includes(i);
        mesh.selectable = legal;
        const hidden = core.hidden || core.id === 'hidden';
        mesh.target = {
          x: spread(player.cores.length, i, 1.38),
          y: CARD_T / 2 + 0.03,
          z: CORE_Z[seat],
          rotX: hidden ? Math.PI : 0,
          rotY: this.cardYaw(seat, !hidden && core.countered),
          rotZ: 0,
          scale: legal || this.targetCores.has(key) ? 1.07 : 1,
        };
        if (legal || this.targetCores.has(key)) mesh.target.y = 0.22;
        if (hidden) void mesh.setFace('back');
        else if (core.id !== 'hidden') void mesh.setFace(core.id, typeColor(CARD_DEFS[core.id].type));
        if (created) mesh.snap();
      });

      const comboKey = `combo:${seat}`;
      seen.add(comboKey);
      const { mesh: combo, created: comboNew } = this.ensure(comboKey, 'combo');
      combo.meta = { kind: 'combo', seat, index: 0 };
      combo.selectable = false;
      combo.target = {
        x: COMBO_X,
        y: CARD_T / 2 + 0.02,
        z: PLAY_Z[seat],
        rotX: 0,
        rotY: this.ownerYaw(seat),
        rotZ: 0,
        scale: 0.92,
      };
      void combo.setCombo(SEAT_FACTION[seat], seat === 'B');
      if (comboNew) combo.snap();
    }

    this.playRevealedKnocks(state, justRevealed, createdPlays);

    for (const [key, mesh] of this.cards) {
      if (!seen.has(key)) {
        this.scene.remove(mesh.group);
        this.cards.delete(key);
        this.revealedPlays.delete(key);
      }
    }
  }

  private playRevealedKnocks(
    state: PrivateMatchState,
    justRevealed: Set<string>,
    createdPlays: Set<string>,
  ): void {
    if (!justRevealed.size) return;
    for (let i = 0; i < 5; i++) {
      const keyA = `play:A:${i}`;
      const keyB = `play:B:${i}`;
      if (!justRevealed.has(keyA) && !justRevealed.has(keyB)) continue;
      // Both brand-new this frame = late join, not a live reveal.
      if (createdPlays.has(keyA) && createdPlays.has(keyB)) continue;
      const slotA = state.players.A.played[i];
      const slotB = state.players.B.played[i];
      if (!slotA || !slotB || slotA.hidden || slotB.hidden) continue;
      if (slotA.countered === slotB.countered) continue;
      const winnerSeat: Seat = slotA.countered ? 'B' : 'A';
      const loserSeat: Seat = winnerSeat === 'A' ? 'B' : 'A';
      const winner = this.cards.get(`play:${winnerSeat}:${i}`);
      const loser = this.cards.get(`play:${loserSeat}:${i}`);
      if (!winner || !loser || winner.busy() || loser.busy()) continue;
      this.playCounterKnock(winner, loser, winnerSeat);
    }
  }

  private playCounterKnock(winner: CardMesh, loser: CardMesh, winnerSeat: Seat): void {
    const loserSeat: Seat = winnerSeat === 'A' ? 'B' : 'A';
    const winYaw = this.ownerYaw(winnerSeat);
    const loseYaw = this.ownerYaw(loserSeat);
    const dir = winnerSeat === 'A' ? -1 : 1;
    const wRest: CardTarget = { ...winner.target, rotY: winYaw };
    const lRest: CardTarget = { ...loser.target, rotY: this.cardYaw(loserSeat, true) };
    loser.target = lRest;
    winner.target = wRest;

    const faceUpW: CardTarget = { ...wRest, rotX: 0, rotY: winYaw, rotZ: 0 };
    const faceUpL: CardTarget = { ...lRest, rotX: 0, rotY: loseYaw, rotZ: 0 };
    const lunge: CardTarget = {
      ...faceUpW,
      z: wRest.z + dir * 0.4,
      y: 0.34,
      rotX: dir * 0.32,
      scale: 1.05,
    };
    const hit: CardTarget = {
      ...faceUpL,
      z: lRest.z + dir * 0.24,
      y: 0.46,
      rotY: loseYaw + Math.PI,
      rotZ: -dir * 0.6,
      scale: 1.03,
    };
    const spinRest: CardTarget = { ...lRest, rotY: loseYaw + Math.PI * 3 };

    winner.playMotion([
      { duration: 0.32, to: faceUpW, ease: easeOutCubic },
      { duration: 0.14, to: lunge, ease: easeInCubic },
      { duration: 0.3, to: wRest, ease: easeOutCubic },
    ]);
    loser.playMotion(
      [
        { duration: 0.32, to: faceUpL, ease: easeOutCubic },
        { duration: 0.12, to: faceUpL },
        { duration: 0.16, to: hit, ease: easeOutCubic },
        { duration: 0.5, to: spinRest, ease: easeOutCubic },
      ],
      () => loser.unwrapYaw(),
    );
  }

  private ensure(key: string, id: CardId | 'combo' | 'back'): { mesh: CardMesh; created: boolean } {
    let mesh = this.cards.get(key);
    if (!mesh) {
      const color =
        id === 'combo'
          ? FACTION_COLOR[SEAT_FACTION[key.startsWith('combo:B') ? 'B' : 'A']]
          : id === 'back'
            ? '#1a1a1a'
            : typeColor(CARD_DEFS[id].type);
      mesh = new CardMesh(key, color);
      this.cards.set(key, mesh);
      this.scene.add(mesh.group);
      return { mesh, created: true };
    }
    return { mesh, created: false };
  }

  private resize(): void {
    const canvas = this.renderer.domElement;
    const parent = canvas.parentElement ?? document.body;
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(h, 1);
    this.applyCamera();
    this.renderer.setSize(w, h, false);
  }

  private ndc(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private hit(): CardMesh | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const objs = [...this.cards.values()].map((c) => c.mesh);
    const hits = this.raycaster.intersectObjects(objs, false);
    if (!hits.length) return null;
    const group = hits[0].object.parent;
    return (group?.userData.card as CardMesh) ?? null;
  }

  private onHover(e: PointerEvent): void {
    this.ndc(e);
    const card = this.hit();
    this.hoverKey = card?.selectable ? card.key : null;
    const inspect = card ? this.peekId(card) : null;
    this.renderer.domElement.style.cursor = this.hoverKey ? 'pointer' : inspect ? 'zoom-in' : 'default';
    this.setInspect(inspect);
  }

  private peekId(card: CardMesh): FaceId | null {
    if (card.meta.kind === 'combo') return card.faceId;
    if (card.faceId === 'back') return null;
    if (card.meta.cardId) return card.meta.cardId;
    return null;
  }

  private setInspect(id: FaceId | null): void {
    if (id === this.inspectId) return;
    this.inspectId = id;
    this.picks.onInspect(id);
  }

  private clearInspect(): void {
    this.hoverKey = null;
    this.renderer.domElement.style.cursor = 'default';
    this.setInspect(null);
  }

  private onPointer(e: PointerEvent): void {
    this.ndc(e);
    const card = this.hit();
    if (!card || !card.selectable) return;
    e.preventDefault();
    if (card.meta.kind === 'hand' && card.meta.cardId) {
      this.picks.onHand(card.meta.seat, card.meta.cardId);
    } else if (card.meta.kind === 'core') {
      this.picks.onCore(card.meta.seat, card.meta.index);
    }
  }

  private tick(): void {
    const dt = this.clock.getDelta();
    for (const mesh of this.cards.values()) {
      const hover = mesh.key === this.hoverKey;
      const selected = mesh.key === this.selectedKey || this.targetCores.has(mesh.key);
      if (mesh.meta.kind === 'hand' || mesh.meta.kind === 'core') {
        mesh.setHighlight(hover || mesh.selectable, selected);
      }
      mesh.tick(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }
}

function spread(count: number, index: number, gap: number): number {
  const width = (count - 1) * gap;
  return -width / 2 + index * gap;
}
