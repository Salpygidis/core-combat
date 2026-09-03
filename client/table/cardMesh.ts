import * as THREE from 'three';
import { TYPE_COLOR } from '@shared/cards';
import type { CardId, CardType } from '@shared/types';
import { loadFaceTexture } from './textures';

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

export class CardMesh {
  readonly group: THREE.Group;
  readonly mesh: THREE.Mesh;
  key: string;
  faceId: CardId | 'combo' | 'back';
  target: CardTarget;
  selectable = false;
  meta: { kind: 'hand' | 'play' | 'core' | 'combo'; seat: 'A' | 'B'; index: number; cardId?: CardId };

  constructor(key: string, color: string) {
    this.key = key;
    this.faceId = 'back';
    this.meta = { kind: 'hand', seat: 'A', index: 0 };
    const geo = new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H);
    const side = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.15 });
    const front = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.55, metalness: 0.05 });
    const back = new THREE.MeshStandardMaterial({ color: '#3a1810', roughness: 0.55, metalness: 0.05 });
    const materials = [side, side, front, back, side, side];
    this.mesh = new THREE.Mesh(geo, materials);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.group.userData.card = this;
    this.target = { x: 0, y: CARD_T / 2, z: 0, rotX: 0, rotY: 0, rotZ: 0, scale: 1 };
  }

  async setFace(id: CardId | 'combo' | 'back', typeColor?: string): Promise<void> {
    this.faceId = id;
    const mats = this.mesh.material as THREE.MeshStandardMaterial[];
    const face = await loadFaceTexture(id);
    const back = await loadFaceTexture('back');
    mats[2].map = face;
    mats[2].color.set('#ffffff');
    mats[2].needsUpdate = true;
    mats[3].map = back;
    mats[3].color.set('#ffffff');
    mats[3].needsUpdate = true;
    if (typeColor) {
      for (const i of [0, 1, 4, 5]) {
        mats[i].color.set(typeColor);
      }
    }
  }

  setHighlight(on: boolean, selected: boolean): void {
    const mats = this.mesh.material as THREE.MeshStandardMaterial[];
    const emissive = selected ? 0x665522 : on ? 0x333322 : 0x000000;
    for (const m of mats) {
      m.emissive = new THREE.Color(emissive);
    }
    this.target.y = selected ? 0.28 : on ? 0.16 : CARD_T / 2 + 0.01;
    this.target.scale = selected ? 1.06 : 1;
  }

  tick(dt: number): void {
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

  snap(): void {
    this.group.position.set(this.target.x, this.target.y, this.target.z);
    this.group.rotation.set(this.target.rotX, this.target.rotY, this.target.rotZ);
    this.group.scale.setScalar(this.target.scale);
  }
}

export function typeColor(type: CardType | undefined): string {
  return type ? TYPE_COLOR[type] : '#3a1810';
}
