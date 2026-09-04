import * as THREE from 'three';
import { FACTION_COLOR, comboFace, TYPE_COLOR } from '@shared/cards';
import type { CardId, CardType, Faction } from '@shared/types';
import { loadAlignedBackTexture, loadAlignedFaceTexture, loadFaceTexture, type FaceId } from './textures';

export const CARD_W = 1.16;
export const CARD_H = 1.64;
export const CARD_T = 0.08;

export interface CardTarget {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
}

export interface MotionStep {
  duration: number;
  to?: Partial<CardTarget>;
  ease?: (t: number) => number;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function easeInCubic(t: number): number {
  return t ** 3;
}

export class CardMesh {
  readonly group: THREE.Group;
  readonly mesh: THREE.Mesh;
  key: string;
  faceId: FaceId;
  target: CardTarget;
  selectable = false;
  meta: { kind: 'hand' | 'play' | 'core' | 'combo'; seat: 'A' | 'B'; index: number; cardId?: CardId };
  private motion: { steps: MotionStep[]; index: number; t: number; from: CardTarget } | null = null;
  private motionEnd: (() => void) | null = null;

  constructor(key: string, color: string) {
    this.key = key;
    this.faceId = 'back';
    this.meta = { kind: 'hand', seat: 'A', index: 0 };
    const geo = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H);
    const side = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 });
    const front = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.55, metalness: 0.05 });
    const back = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.55, metalness: 0.05 });
    const materials = [side, side, front, back, side, side];
    this.mesh = new THREE.Mesh(geo, materials);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.userData.card = this;
    this.target = { x: 0, y: CARD_T / 2, z: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 };
  }

  async setFace(id: FaceId, typeColor?: string): Promise<void> {
    this.faceId = id;
    const mats = this.mesh.material as THREE.MeshStandardMaterial[];
    const face = await loadFaceTexture(id);
    mats[2].map = face;
    mats[2].color.set('#ffffff');
    mats[2].needsUpdate = true;
    mats[3].map = await loadAlignedBackTexture();
    mats[3].color.set('#ffffff');
    mats[3].needsUpdate = true;
    if (typeColor) {
      for (const i of [0, 1, 4, 5]) {
        mats[i].color.set(typeColor);
      }
    }
  }

  /** Two-sided reference: faction combo on the front, that faction's reverse printing on the back. */
  async setCombo(faction: Faction, flipped = false): Promise<void> {
    this.faceId = comboFace(faction, flipped);
    const mats = this.mesh.material as THREE.MeshStandardMaterial[];
    const face = await loadFaceTexture(comboFace(faction));
    const reverse = await loadAlignedFaceTexture(comboFace(faction, true));
    mats[2].map = face;
    mats[2].color.set('#ffffff');
    mats[2].needsUpdate = true;
    mats[3].map = reverse;
    mats[3].color.set('#ffffff');
    mats[3].needsUpdate = true;
    const edge = FACTION_COLOR[faction];
    for (const i of [0, 1, 4, 5]) {
      mats[i].color.set(edge);
    }
    // Horizontal flip (around the card's long axis) so the reverse is face-up.
    this.mesh.rotation.z = flipped ? Math.PI : 0;
  }

  setHighlight(on: boolean, selected: boolean): void {
    if (this.busy()) return;
    const mats = this.mesh.material as THREE.MeshStandardMaterial[];
    const emissive = selected ? 0x665522 : on ? 0x333322 : 0x000000;
    for (const m of mats) {
      m.emissive = new THREE.Color(emissive);
    }
    this.target.y = selected ? 0.28 : on ? 0.16 : CARD_T / 2 + 0.01;
    this.target.scale = selected ? 1.06 : 1;
  }

  busy(): boolean {
    return this.motion !== null;
  }

  playMotion(steps: MotionStep[], onEnd?: () => void): void {
    if (!steps.length) return;
    this.motion = { steps, index: 0, t: 0, from: this.capture() };
    this.motionEnd = onEnd ?? null;
  }

  unwrapYaw(): void {
    const t = this.target.rotY;
    let y = this.group.rotation.y;
    const two = Math.PI * 2;
    while (y - t > Math.PI) y -= two;
    while (t - y > Math.PI) y += two;
    this.group.rotation.y = y;
  }

  tick(dt: number): void {
    const stepDt = Math.min(dt, 0.05);
    if (this.motion) {
      this.tickMotion(stepDt);
      return;
    }
    const k = 1 - Math.pow(0.0008, dt);
    this.group.position.x += (this.target.x - this.group.position.x) * k;
    this.group.position.y += (this.target.y - this.group.position.y) * k;
    this.group.position.z += (this.target.z - this.group.position.z) * k;
    this.group.rotation.x += (this.target.rotX - this.group.rotation.x) * k;
    this.group.rotation.y += (this.target.rotY - this.group.rotation.y) * k;
    this.group.rotation.z += (this.target.rotZ - this.group.rotation.z) * k;
    const s = this.group.scale.x + (this.target.scale - this.group.scale.x) * k;
    this.group.scale.setScalar(s);
  }

  private tickMotion(dt: number): void {
    const motion = this.motion;
    if (!motion) return;
    const step = motion.steps[motion.index];
    motion.t += dt;
    const u = step.duration <= 0 ? 1 : Math.min(1, motion.t / step.duration);
    const e = step.ease ? step.ease(u) : u;
    const to = { ...motion.from, ...step.to };
    this.apply(lerpPose(motion.from, to, e));
    if (u < 1) return;
    motion.index += 1;
    motion.t = 0;
    motion.from = this.capture();
    if (motion.index >= motion.steps.length) {
      this.motion = null;
      const done = this.motionEnd;
      this.motionEnd = null;
      done?.();
    }
  }

  private capture(): CardTarget {
    return {
      x: this.group.position.x,
      y: this.group.position.y,
      z: this.group.position.z,
      rotX: this.group.rotation.x,
      rotY: this.group.rotation.y,
      rotZ: this.group.rotation.z,
      scale: this.group.scale.x,
    };
  }

  private apply(p: CardTarget): void {
    this.group.position.set(p.x, p.y, p.z);
    this.group.rotation.set(p.rotX, p.rotY, p.rotZ);
    this.group.scale.setScalar(p.scale);
  }

  snap(): void {
    this.group.position.set(this.target.x, this.target.y, this.target.z);
    this.group.rotation.set(this.target.rotX, this.target.rotY, this.target.rotZ);
    this.group.scale.setScalar(this.target.scale);
  }
}

export function typeColor(type: CardType | undefined): string {
  return type ? TYPE_COLOR[type] : '#1a1a1a';
}

function lerpPose(a: CardTarget, b: CardTarget, t: number): CardTarget {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    rotX: a.rotX + (b.rotX - a.rotX) * t,
    rotY: a.rotY + (b.rotY - a.rotY) * t,
    rotZ: a.rotZ + (b.rotZ - a.rotZ) * t,
    scale: a.scale + (b.scale - a.scale) * t,
  };
}
