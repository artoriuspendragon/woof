import type { WorldState } from '../sim/types';
import { TERRAIN } from '../data/terrain';
import { RESOURCE } from '../data/resources';
import { SPECIES } from '../data/species';
import { Camera } from './camera';

export type FxKind = 'war' | 'celebrate' | 'build' | 'good' | 'epic' | 'fall';
interface Particle { ang: number; spd: number; size: number; }
interface Fx { tile: number; born: number; ttl: number; kind: FxKind; parts: Particle[]; }

const FX_CFG: Record<FxKind, { emoji: string; ring: string; pcolor: string; n: number; ttl: number; rise: boolean }> = {
  war:       { emoji: '⚔️', ring: '210,60,50',  pcolor: '#d23a2e', n: 7,  ttl: 1500, rise: false },
  celebrate: { emoji: '🎉', ring: '230,120,180', pcolor: '#ffcf4a', n: 12, ttl: 1900, rise: false },
  build:     { emoji: '🔨', ring: '150,120,80',  pcolor: '#c2a06a', n: 7,  ttl: 1500, rise: true },
  good:      { emoji: '🌾', ring: '120,200,120', pcolor: '#8fd06a', n: 9,  ttl: 1700, rise: true },
  epic:      { emoji: '✨', ring: '255,200,80',  pcolor: '#ffd24a', n: 14, ttl: 2200, rise: true },
  fall:      { emoji: '🏴', ring: '90,90,90',    pcolor: '#8a8a8a', n: 9,  ttl: 2000, rise: false },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export class Renderer {
  cam = new Camera();
  private ctx: CanvasRenderingContext2D;
  private terrainCanvas: HTMLCanvasElement;     // 1px/格的地形底图（仅 setWorld 时重画）
  private terrCtx: CanvasRenderingContext2D;
  private territoryCanvas: HTMLCanvasElement;    // 1px/格的领土色（每帧重建）
  private territoryCtx: CanvasRenderingContext2D;
  private territoryData: ImageData;
  private fx: Fx[] = [];
  private w = 0; private h = 0;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.terrainCanvas = document.createElement('canvas');
    this.terrCtx = this.terrainCanvas.getContext('2d')!;
    this.territoryCanvas = document.createElement('canvas');
    this.territoryCtx = this.territoryCanvas.getContext('2d')!;
    this.territoryData = new ImageData(1, 1);
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.floor(r.width * this.dpr);
    this.canvas.height = Math.floor(r.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cam.resize(r.width, r.height);
  }

  setWorld(world: WorldState): void {
    this.w = world.width; this.h = world.height;
    this.terrainCanvas.width = world.width; this.terrainCanvas.height = world.height;
    this.territoryCanvas.width = world.width; this.territoryCanvas.height = world.height;
    this.territoryData = this.territoryCtx.createImageData(world.width, world.height);
    this.fx = [];

    const img = this.terrCtx.createImageData(world.width, world.height);
    for (let i = 0; i < world.tiles.length; i++) {
      const t = world.tiles[i];
      const [r, g, b] = hexToRgb(TERRAIN[t.terrain].color);
      const shade = 0.9 + t.tint * 0.2; // 每格微亮度，避免大色块呆板
      img.data[i * 4] = Math.min(255, r * shade);
      img.data[i * 4 + 1] = Math.min(255, g * shade);
      img.data[i * 4 + 2] = Math.min(255, b * shade);
      img.data[i * 4 + 3] = 255;
    }
    this.terrCtx.putImageData(img, 0, 0);
    this.cam.fit(world.width, world.height);
  }

  pushFx(tile: number, kind: FxKind): void {
    const cfg = FX_CFG[kind];
    const parts: Particle[] = [];
    for (let i = 0; i < cfg.n; i++) {
      parts.push({ ang: Math.random() * Math.PI * 2, spd: 0.5 + Math.random() * 1.3, size: 0.12 + Math.random() * 0.18 });
    }
    this.fx.push({ tile, born: performance.now(), ttl: cfg.ttl, kind, parts });
    if (this.fx.length > 60) this.fx.shift();
  }

  tileAt(sx: number, sy: number): number | null {
    const [wx, wy] = this.cam.screenToWorld(sx, sy);
    const tx = Math.floor(wx), ty = Math.floor(wy);
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return null;
    return ty * this.w + tx;
  }

  render(world: WorldState, selected: string | null): void {
    const ctx = this.ctx, cam = this.cam;
    // 海洋底色
    ctx.fillStyle = '#bfe0ec';
    ctx.fillRect(0, 0, cam.vw, cam.vh);

    const [dx0, dy0] = cam.worldToScreen(0, 0);
    const [dx1, dy1] = cam.worldToScreen(world.width, world.height);

    // 地形底图
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrainCanvas, dx0, dy0, dx1 - dx0, dy1 - dy0);

    // 领土色块（重建 1px/格图到独立 territoryCanvas，再半透明叠加）
    const data = this.territoryData.data;
    for (let i = 0; i < world.tiles.length; i++) {
      const owner = world.tiles[i].owner;
      if (owner && world.nations[owner]?.alive) {
        const [r, g, b] = hexToRgb(world.nations[owner].color);
        data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
      } else {
        data[i * 4 + 3] = 0;
      }
    }
    this.territoryCtx.putImageData(this.territoryData, 0, 0);
    ctx.globalAlpha = 0.42;
    ctx.drawImage(this.territoryCanvas, dx0, dy0, dx1 - dx0, dy1 - dy0);
    ctx.globalAlpha = 1;

    // 国界描边（仅可视范围）
    this.drawBorders(world, selected);

    // 选中国家光晕（在城市标记之下）
    if (selected && world.nations[selected]?.alive) this.drawSelectionGlow(world, selected);

    // 资源 + 城市 + 首都标记
    this.drawMarkers(world);

    // 军队（行军中的实体）
    this.drawArmies(world);

    // 进行中的战争连线（持续动画）
    this.drawWarLinks(world);

    // 一次性事件特效
    this.drawFx(world);
  }

  private drawWarLinks(world: WorldState): void {
    const ctx = this.ctx, cam = this.cam, now = performance.now();
    const seen = new Set<string>();
    const pulse = 0.5 + 0.5 * Math.sin(now / 220);
    for (const a of Object.values(world.nations)) {
      if (!a.alive) continue;
      for (const bid of a.atWar) {
        const b = world.nations[bid];
        if (!b?.alive) continue;
        const key = a.id < bid ? `${a.id}|${bid}` : `${bid}|${a.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const [ax, ay] = cam.worldToScreen((a.capitalTile % world.width) + 0.5, ((a.capitalTile / world.width) | 0) + 0.5);
        const [bx, by] = cam.worldToScreen((b.capitalTile % world.width) + 0.5, ((b.capitalTile / world.width) | 0) + 0.5);
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -now / 40;
        ctx.strokeStyle = `rgba(210,60,50,${0.35 + pulse * 0.3})`;
        ctx.lineWidth = 2;
        line(ctx, ax, ay, bx, by);
        ctx.restore();
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const fz = Math.max(16, cam.scale * 1.2) * (0.9 + pulse * 0.25);
        ctx.font = `${Math.round(fz)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚔️', mx, my);
      }
    }
  }

  private drawBorders(world: WorldState, selected: string | null): void {
    const ctx = this.ctx, cam = this.cam, s = cam.scale;
    ctx.lineWidth = Math.max(1, s * 0.09);
    for (let i = 0; i < world.tiles.length; i++) {
      const owner = world.tiles[i].owner;
      if (!owner || !world.nations[owner]?.alive) continue;
      const x = i % world.width, y = (i / world.width) | 0;
      const [sx, sy] = cam.worldToScreen(x, y);
      if (sx < -s || sy < -s || sx > cam.vw + s || sy > cam.vh + s) continue;
      const isSel = owner === selected;
      ctx.strokeStyle = isSel ? '#fff7d6' : shade(world.nations[owner].color, 0.6);
      ctx.lineWidth = isSel ? Math.max(1.5, s * 0.16) : Math.max(1, s * 0.09);
      // 右、下两条边即可覆盖全部相邻关系
      const right = i + 1, down = i + world.width;
      if (x < world.width - 1 && world.tiles[right].owner !== owner) line(ctx, sx + s, sy, sx + s, sy + s);
      if (x > 0 && world.tiles[i - 1].owner !== owner) line(ctx, sx, sy, sx, sy + s);
      if (y < world.height - 1 && world.tiles[down].owner !== owner) line(ctx, sx, sy + s, sx + s, sy + s);
      if (y > 0 && world.tiles[i - world.width].owner !== owner) line(ctx, sx, sy, sx + s, sy);
    }
  }

  private drawMarkers(world: WorldState): void {
    const ctx = this.ctx, cam = this.cam, s = cam.scale;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // 资源（缩放足够大时显示 emoji）
    if (s >= 14) {
      ctx.font = `${Math.round(s * 0.8)}px serif`;
      for (let i = 0; i < world.tiles.length; i++) {
        const res = world.tiles[i].resource;
        if (!res || world.tiles[i].city > 0) continue;
        const x = i % world.width, y = (i / world.width) | 0;
        const [sx, sy] = cam.worldToScreen(x + 0.5, y + 0.5);
        if (sx < 0 || sy < 0 || sx > cam.vw || sy > cam.vh) continue;
        ctx.fillText(RESOURCE[res].emoji, sx, sy);
      }
    }

    // 城市（首都最大）
    for (let i = 0; i < world.tiles.length; i++) {
      const lvl = world.tiles[i].city;
      if (lvl <= 0) continue;
      const owner = world.tiles[i].owner;
      if (!owner || !world.nations[owner]?.alive) continue;
      const isCap = i === world.nations[owner].capitalTile;
      const x = i % world.width, y = (i / world.width) | 0;
      const [sx, sy] = cam.worldToScreen(x + 0.5, y + 0.5);
      if (sx < -s || sy < -s || sx > cam.vw + s || sy > cam.vh + s) continue;
      const color = world.nations[owner].color;

      if (s >= 11) {
        const emoji = isCap ? '🏰' : lvl >= 2 ? '🏙️' : '🏠';
        const fz = s * (isCap ? 1.35 : lvl >= 2 ? 1.0 : 0.8);
        ctx.font = `${Math.round(fz)}px serif`;
        ctx.fillText(emoji, sx, sy - fz * 0.05);
      } else {
        const r = Math.max(2.5, s * (isCap ? 0.5 : lvl >= 2 ? 0.34 : 0.24));
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.lineWidth = isCap ? 2.5 : 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
        if (isCap) { ctx.beginPath(); ctx.arc(sx, sy, r * 0.38, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
      }
    }
  }

  private drawArmies(world: WorldState): void {
    const ctx = this.ctx, cam = this.cam, s = cam.scale;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const a of Object.values(world.armies)) {
      const n = world.nations[a.nation];
      if (!n?.alive) continue;
      const x = a.tile % world.width, y = (a.tile / world.width) | 0;
      const [sx, sy] = cam.worldToScreen(x + 0.5, y + 0.5);
      if (sx < -s || sy < -s || sx > cam.vw + s || sy > cam.vh + s) continue;

      // 行军轨迹（上一格 → 当前格）
      if (a.prevTile !== a.tile) {
        const [px, py] = cam.worldToScreen((a.prevTile % world.width) + 0.5, ((a.prevTile / world.width) | 0) + 0.5);
        ctx.strokeStyle = 'rgba(60,40,20,0.35)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]); line(ctx, px, py, sx, sy); ctx.setLineDash([]);
      }

      const r = Math.max(5, s * 0.42) * (a.size > 150 ? 1.25 : a.size > 60 ? 1.0 : 0.8);
      // 菱形战旗（区别于圆形城市），底色为国家色
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = n.color; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.restore();
      if (s >= 9) {
        // 该种族的「披甲出征」形象：动物 + 交叉刀剑徽记
        ctx.font = `${Math.round(r * 1.5)}px serif`;
        ctx.fillText(SPECIES[n.species].emoji, sx, sy);
        if (s >= 13) { ctx.font = `${Math.round(r * 0.9)}px serif`; ctx.fillText('⚔️', sx + r * 0.85, sy + r * 0.8); }
      }
    }
  }

  private drawSelectionGlow(world: WorldState, selected: string): void {
    const ctx = this.ctx, cam = this.cam, s = cam.scale;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#fffbe0';
    for (let i = 0; i < world.tiles.length; i++) {
      if (world.tiles[i].owner !== selected) continue;
      const x = i % world.width, y = (i / world.width) | 0;
      const [sx, sy] = cam.worldToScreen(x, y);
      ctx.fillRect(sx, sy, s, s);
    }
    ctx.globalAlpha = 1;
  }

  private drawFx(world: WorldState): void {
    const ctx = this.ctx, cam = this.cam, now = performance.now(), unit = cam.scale / 12;
    this.fx = this.fx.filter((f) => now - f.born < f.ttl);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.fx) {
      const cfg = FX_CFG[f.kind];
      const x = f.tile % world.width, y = (f.tile / world.width) | 0;
      const [sx, sy] = cam.worldToScreen(x + 0.5, y + 0.5);
      const t = (now - f.born) / f.ttl;          // 0..1

      // 扩散光环
      const r = (6 + t * 42) * unit;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${cfg.ring},${(1 - t) * 0.85})`;
      ctx.lineWidth = Math.max(1, 4 * (1 - t)); ctx.stroke();

      // 粒子
      const spread = 34 * unit;
      for (const p of f.parts) {
        const grav = cfg.rise ? -t * 0.6 : t * 0.5;
        const px = sx + Math.cos(p.ang) * p.spd * t * spread;
        const py = sy + (Math.sin(p.ang) * p.spd + grav) * t * spread;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = cfg.pcolor;
        const ps = Math.max(1.5, p.size * cam.scale);
        ctx.fillRect(px - ps / 2, py - ps / 2, ps, ps);
      }
      ctx.globalAlpha = 1;

      // 主图标：弹出 + 上浮
      if (cam.scale >= 7) {
        const pop = t < 0.2 ? t / 0.2 : 1;
        const fz = cam.scale * (0.7 + pop * 0.7);
        ctx.font = `${Math.round(fz)}px serif`;
        ctx.globalAlpha = 1 - t;
        ctx.fillText(cfg.emoji, sx, sy - r * 0.5);
        ctx.globalAlpha = 1;
      }
    }
  }
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

function shade(hex: string, f: number): string {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * f);
  return `rgb(${r},${g},${b})`;
}
