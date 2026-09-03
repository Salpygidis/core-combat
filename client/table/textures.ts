import * as THREE from 'three';
import { CARD_DEFS, COMBO_TEXT, TYPE_COLOR } from '@shared/cards';
import type { CardId } from '@shared/types';

const W = 512;
const H = 716;
const cache = new Map<string, Promise<THREE.Texture>>();

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
}

function canvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

async function tryImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function textureFromImage(img: HTMLImageElement): THREE.Texture {
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export async function loadFaceTexture(id: CardId | 'combo' | 'back'): Promise<THREE.Texture> {
  const key = `face:${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const promise = (async () => {
    const img = await tryImage(`/cards/${id}.png`);
    if (img) return textureFromImage(img);
    if (id === 'back') return drawBack();
    if (id === 'combo') return drawCombo();
    return drawPlaceholder(id);
  })();
  cache.set(key, promise);
  return promise;
}

export function drawPlaceholder(id: CardId): THREE.CanvasTexture {
  const def = CARD_DEFS[id];
  const color = TYPE_COLOR[def.type];
  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1a120c';
  ctx.fillRect(0, 0, W, H);

  const inset = 18;
  roundRect(ctx, inset, inset, W - inset * 2, H - inset * 2, 28);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.22;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.45, color);
  g.addColorStop(1, '#000000');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  roundRect(ctx, inset + 10, inset + 10, W - (inset + 10) * 2, H - (inset + 10) * 2, 20);
  ctx.strokeStyle = 'rgba(255,236,190,0.75)';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, 48, 48, W - 96, 86, 12);
  ctx.fill();

  ctx.fillStyle = '#fff6e0';
  ctx.font = 'bold 54px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.typeName.toUpperCase(), W / 2, 92);

  ctx.font = 'bold 210px Impact, "Arial Black", sans-serif';
  ctx.fillStyle = '#fffef8';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.fillText(String(def.live), W / 2, 250);
  ctx.shadowBlur = 0;

  ctx.font = '600 22px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,246,224,0.9)';
  ctx.fillText('LIVE', W / 2, 360);

  wrapText(ctx, def.effectText, W / 2, 420, W - 80, 32);

  ctx.save();
  ctx.translate(W / 2, H - 150);
  ctx.rotate(Math.PI);
  ctx.font = 'bold 150px Impact, "Arial Black", sans-serif';
  ctx.fillStyle = '#fffef8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatValue(def.countered), 0, 0);
  ctx.font = '600 22px "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,246,224,0.85)';
  ctx.fillText('COUNTERED', 0, 90);
  ctx.restore();

  return canvasTexture(canvas);
}

export function drawBack(): THREE.CanvasTexture {
  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#140c08';
  ctx.fillRect(0, 0, W, H);
  roundRect(ctx, 18, 18, W - 36, H - 36, 28);
  ctx.fillStyle = '#3a1810';
  ctx.fill();
  roundRect(ctx, 36, 36, W - 72, H - 72, 22);
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = '#c9a227';
  ctx.font = 'bold 92px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CORE', W / 2, H / 2 - 40);
  ctx.font = 'bold 64px Impact, "Arial Black", sans-serif';
  ctx.fillStyle = '#e8d5a3';
  ctx.fillText('COMBAT', W / 2, H / 2 + 50);

  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = 'rgba(201,162,39,0.35)';
    ctx.lineWidth = 3;
    roundRect(ctx, 56 + i * 8, 56 + i * 8, W - 112 - i * 16, H - 112 - i * 16, 18);
    ctx.stroke();
  }
  return canvasTexture(canvas);
}

export function drawCombo(): THREE.CanvasTexture {
  const canvas = makeCanvas();
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1b140c';
  ctx.fillRect(0, 0, W, H);
  roundRect(ctx, 18, 18, W - 36, H - 36, 28);
  ctx.fillStyle = '#6b4e16';
  ctx.fill();
  ctx.fillStyle = '#f3e2a8';
  ctx.font = 'bold 64px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('COMBO', W / 2, 120);
  wrapText(ctx, COMBO_TEXT, W / 2, 260, W - 80, 36);
  ctx.font = '600 28px "Segoe UI", sans-serif';
  ctx.fillText('Public  ·  Cores do not count', W / 2, H - 80);
  return canvasTexture(canvas);
}

export function drawFelt(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1a2a1c';
  ctx.fillRect(0, 0, 512, 512);
  const img = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 28;
    img.data[i] = 26 + n;
    img.data[i + 1] = 42 + n;
    img.data[i + 2] = 28 + n;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = canvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  return tex;
}

function formatValue(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  ctx.font = '600 28px "Segoe UI", sans-serif';
  ctx.fillStyle = '#fff6e0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}


