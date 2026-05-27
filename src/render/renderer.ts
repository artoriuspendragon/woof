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
    const pulse = 0.5 + 0.5 * Math.sin(now / 240);
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

        // 弧形蜡红墨线（quadratic bezier）—— 而非僵直的直线
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy);
        const off = Math.min(48, len * 0.18);
        const perpX = -dy / (len || 1), perpY = dx / (len || 1);
        const cx = (ax + bx) / 2 + perpX * off;
        const cy = (ay + by) / 2 + perpY * off;

        ctx.save();
        ctx.setLineDash([7, 5]);
        ctx.lineDashOffset = -now / 38;
        ctx.strokeStyle = `rgba(168, 57, 44, ${0.34 + pulse * 0.28})`;
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx, cy, bx, by);
        ctx.stroke();
        ctx.restore();

        // 曲线中点（t=0.5）：放一枚交叉短剑印章，比 ⚔️ emoji 一致性更好
        const bzx = 0.25 * ax + 0.5 * cx + 0.25 * bx;
        const bzy = 0.25 * ay + 0.5 * cy + 0.25 * by;
        const ms = Math.max(11, cam.scale * 0.65) * (0.94 + pulse * 0.12);
        drawCrossedDaggers(ctx, bzx, bzy, ms, pulse);
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

    // 资源 emoji（与可爱基调一致；缩放足够大时显示）
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

    // 城市：画出建筑剪影（不用 emoji，跨平台一致 + 更像箱庭地图筹码）
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

      if (s >= 10) {
        const size = s * (isCap ? 1.25 : lvl >= 2 ? 0.95 : 0.78);
        if (isCap)         drawCastle(ctx, sx, sy, size, color);
        else if (lvl >= 2) drawCityCluster(ctx, sx, sy, size, color);
        else               drawCottage(ctx, sx, sy, size, color);
      } else {
        // 低缩放回退：圆点 + 首都内白点
        const r = Math.max(2.5, s * (isCap ? 0.5 : lvl >= 2 ? 0.34 : 0.24));
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.lineWidth = isCap ? 2.5 : 1.5; ctx.strokeStyle = '#fff8e6'; ctx.stroke();
        if (isCap) {
          ctx.beginPath(); ctx.arc(sx, sy, r * 0.34, 0, Math.PI * 2);
          ctx.fillStyle = '#fff8e6'; ctx.fill();
        }
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
        ctx.strokeStyle = 'rgba(58, 42, 28, 0.32)'; ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 3]); line(ctx, px, py, sx, sy); ctx.setLineDash([]);
      }

      const r = Math.max(5, s * 0.42) * (a.size > 150 ? 1.25 : a.size > 60 ? 1.0 : 0.85);
      const low = a.supply < 30;

      // 纹章盾牌（heraldic shield）—— 圆顶 + 尖底，比菱形更有"战旗"语义
      drawShield(ctx, sx, sy, r, n.color, low);

      if (s >= 9) {
        ctx.font = `${Math.round(r * 1.4)}px serif`;
        ctx.fillText(SPECIES[n.species].emoji, sx, sy - r * 0.08);
        if (low && s >= 11) {
          // 缺粮标记：盾右上挂一颗蜡红水印
          drawSupplyMark(ctx, sx + r * 0.85, sy - r * 0.75, Math.max(5, r * 0.38));
        }
      }
    }
  }

  private drawSelectionGlow(world: WorldState, selected: string): void {
    // 不再涂一层米色把领土色洗淡；改成沿领土"外缘"画一圈呼吸的金线（halo + line 双笔）。
    const ctx = this.ctx, cam = this.cam, s = cam.scale;
    const now = performance.now();
    const pulse = 0.55 + 0.45 * Math.sin(now / 380);

    const drawPerimeter = (pass: 0 | 1) => {
      if (pass === 0) {
        ctx.strokeStyle = `rgba(184, 139, 61, ${0.16 + pulse * 0.14})`;
        ctx.lineWidth = Math.max(4.5, s * 0.38);
      } else {
        ctx.strokeStyle = `rgba(228, 188, 110, ${0.85 + pulse * 0.15})`;
        ctx.lineWidth = Math.max(1.6, s * 0.13);
      }
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let i = 0; i < world.tiles.length; i++) {
        if (world.tiles[i].owner !== selected) continue;
        const x = i % world.width, y = (i / world.width) | 0;
        const [sx, sy] = cam.worldToScreen(x, y);
        if (sx < -s || sy < -s || sx > cam.vw + s || sy > cam.vh + s) continue;
        if (x < world.width - 1 && world.tiles[i + 1].owner !== selected) line(ctx, sx + s, sy, sx + s, sy + s);
        if (x > 0 && world.tiles[i - 1].owner !== selected) line(ctx, sx, sy, sx, sy + s);
        if (y < world.height - 1 && world.tiles[i + world.width].owner !== selected) line(ctx, sx, sy + s, sx + s, sy + s);
        if (y > 0 && world.tiles[i - world.width].owner !== selected) line(ctx, sx, sy, sx + s, sy);
      }
    };
    drawPerimeter(0);
    drawPerimeter(1);
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

      // 粒子（按事件类别给不同形状：圆点 / 三角火星 / 金色四角星）
      const spread = 34 * unit;
      for (const p of f.parts) {
        const grav = cfg.rise ? -t * 0.6 : t * 0.5;
        const px = sx + Math.cos(p.ang) * p.spd * t * spread;
        const py = sy + (Math.sin(p.ang) * p.spd + grav) * t * spread;
        ctx.globalAlpha = 1 - t;
        ctx.fillStyle = cfg.pcolor;
        const ps = Math.max(1.6, p.size * cam.scale);
        drawParticle(ctx, px, py, ps, f.kind, p.ang);
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

// ────────────────────────────────────────────────────────────
// Map-token icon vocabulary (all hand-drawn paths, no emoji)
// ────────────────────────────────────────────────────────────

// Constants used by all icons
const INK_OUTLINE = '#fff8e6';   // cream outline — matches paper-0
const INK_DEEP    = '#3a2a1c';   // deep walnut — for ink details
const GOLD        = '#caa055';

// A single cottage: rounded body + steep roof, in nation color.
function drawCottage(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, color: string): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'round';
  ctx.lineWidth = Math.max(1, size * 0.07);
  ctx.strokeStyle = INK_OUTLINE;
  // body
  const w = size * 0.78;
  const bodyTop = sy - size * 0.04;
  const bodyBot = sy + size * 0.42;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.rect(sx - w / 2, bodyTop, w, bodyBot - bodyTop);
  ctx.fill();
  ctx.stroke();
  // roof (slightly wider eaves)
  const eave = size * 0.06;
  ctx.fillStyle = shade(color, 0.66);
  ctx.beginPath();
  ctx.moveTo(sx - w / 2 - eave, bodyTop + size * 0.02);
  ctx.lineTo(sx, sy - size * 0.46);
  ctx.lineTo(sx + w / 2 + eave, bodyTop + size * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // tiny door (ink)
  ctx.fillStyle = INK_DEEP;
  ctx.fillRect(sx - size * 0.07, sy + size * 0.16, size * 0.14, size * 0.26);
  ctx.restore();
}

// Two cottages clustered (= city, level 2). One slightly behind/larger.
function drawCityCluster(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, color: string): void {
  drawCottage(ctx, sx + size * 0.24, sy - size * 0.06, size * 0.72, color);
  drawCottage(ctx, sx - size * 0.18, sy + size * 0.02, size * 0.88, color);
}

// Castle (= capital, level 3): two towers + lower curtain wall + gold pennant.
function drawCastle(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, color: string): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'round';
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.strokeStyle = INK_OUTLINE;

  // curtain wall
  const wallW = size * 0.50;
  const wallTop = sy - size * 0.05;
  const wallBot = sy + size * 0.44;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.rect(sx - wallW / 2, wallTop, wallW, wallBot - wallTop);
  ctx.fill();
  ctx.stroke();
  // wall battlement notches (3 small notches cut at the top)
  const notchH = size * 0.07;
  const notchW = wallW / 5;
  ctx.fillStyle = '#faf3df';
  ctx.fillRect(sx - wallW / 2 + notchW * 1, wallTop, notchW * 0.7, notchH);
  ctx.fillRect(sx - wallW / 2 + notchW * 3.3, wallTop, notchW * 0.7, notchH);

  // gate (dark)
  ctx.fillStyle = INK_DEEP;
  const gateW = wallW * 0.32;
  const gateH = size * 0.24;
  ctx.beginPath();
  ctx.moveTo(sx - gateW / 2, wallBot);
  ctx.lineTo(sx - gateW / 2, wallBot - gateH + gateW * 0.4);
  ctx.quadraticCurveTo(sx, wallBot - gateH - gateW * 0.1, sx + gateW / 2, wallBot - gateH + gateW * 0.4);
  ctx.lineTo(sx + gateW / 2, wallBot);
  ctx.closePath();
  ctx.fill();

  // two towers, taller than the wall
  const towerW = size * 0.30;
  const towerTop = sy - size * 0.28;
  ctx.fillStyle = color;
  // left tower
  const lx = sx - wallW / 2 - towerW + size * 0.05;
  ctx.beginPath();
  ctx.rect(lx, towerTop, towerW, wallBot - towerTop);
  ctx.fill(); ctx.stroke();
  // right tower
  const rx = sx + wallW / 2 - size * 0.05;
  ctx.beginPath();
  ctx.rect(rx, towerTop, towerW, wallBot - towerTop);
  ctx.fill(); ctx.stroke();
  // tower battlements (one notch each)
  ctx.fillStyle = '#faf3df';
  ctx.fillRect(lx + towerW * 0.32, towerTop, towerW * 0.35, notchH);
  ctx.fillRect(rx + towerW * 0.32, towerTop, towerW * 0.35, notchH);

  // gold pennant on the right tower
  const flagX = rx + towerW * 0.5;
  const flagBase = towerTop;
  const flagTop  = flagBase - size * 0.22;
  ctx.lineWidth = Math.max(1, size * 0.045);
  ctx.strokeStyle = INK_DEEP;
  ctx.beginPath();
  ctx.moveTo(flagX, flagBase);
  ctx.lineTo(flagX, flagTop);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.moveTo(flagX, flagTop);
  ctx.lineTo(flagX + size * 0.18, flagTop + size * 0.06);
  ctx.lineTo(flagX, flagTop + size * 0.12);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// Heraldic shield: rounded top, pointed bottom. Body in nation color, cream outline.
// `low` (out of supply) shifts outline to wax-red and tints the fill.
function drawShield(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, color: string, low: boolean): void {
  const w = r * 1.85;
  const h = r * 2.15;
  const top    = sy - h * 0.5;
  const flatBot = sy + h * 0.15;     // where the straight sides end and the point begins
  const tip    = sy + h * 0.5;
  const cornerR = Math.min(w * 0.18, h * 0.14);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'round';
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.strokeStyle = low ? '#a8392c' : INK_OUTLINE;
  ctx.fillStyle = low ? shade(color, 0.85) : color;

  ctx.beginPath();
  ctx.moveTo(sx - w / 2 + cornerR, top);
  ctx.lineTo(sx + w / 2 - cornerR, top);
  ctx.quadraticCurveTo(sx + w / 2, top, sx + w / 2, top + cornerR);
  ctx.lineTo(sx + w / 2, flatBot);
  ctx.quadraticCurveTo(sx + w / 2, flatBot + (tip - flatBot) * 0.4, sx, tip);
  ctx.quadraticCurveTo(sx - w / 2, flatBot + (tip - flatBot) * 0.4, sx - w / 2, flatBot);
  ctx.lineTo(sx - w / 2, top + cornerR);
  ctx.quadraticCurveTo(sx - w / 2, top, sx - w / 2 + cornerR, top);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Supply-cut marker: a small wax-red circle with a white droplet glyph.
function drawSupplyMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#a8392c';
  ctx.fill();
  ctx.lineWidth = Math.max(0.8, r * 0.16);
  ctx.strokeStyle = INK_OUTLINE;
  ctx.stroke();
  // droplet shape (teardrop)
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.55);
  ctx.quadraticCurveTo(x + r * 0.5, y + r * 0.05, x, y + r * 0.45);
  ctx.quadraticCurveTo(x - r * 0.5, y + r * 0.05, x, y - r * 0.55);
  ctx.closePath();
  ctx.fillStyle = INK_OUTLINE;
  ctx.fill();
  ctx.restore();
}

// Crossed daggers in a wax-red medallion (war-link midpoint).
function drawCrossedDaggers(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, pulse: number): void {
  ctx.save();
  ctx.translate(cx, cy);

  // medallion ground
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(251, 243, 220, ${0.92 + pulse * 0.06})`;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = `rgba(168, 57, 44, ${0.55 + pulse * 0.25})`;
  ctx.stroke();

  // two crossed strokes
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.6, size * 0.20);
  ctx.strokeStyle = 'rgba(58, 42, 28, 0.88)';
  const reach = size * 0.62;
  ctx.beginPath(); ctx.moveTo(-reach, reach);  ctx.lineTo(reach, -reach); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-reach, -reach); ctx.lineTo(reach, reach);  ctx.stroke();

  // wax-red center seal
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = '#a8392c';
  ctx.fill();

  ctx.restore();
}

// Particles for FX — kind-specific shapes for character.
function drawParticle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, kind: FxKind, ang: number): void {
  if (kind === 'epic') {
    drawStar4(ctx, x, y, size * 1.2, ang);
    return;
  }
  if (kind === 'war') {
    drawSparkTriangle(ctx, x, y, size * 1.1, ang);
    return;
  }
  // build / good / celebrate / fall — soft round dot
  ctx.beginPath();
  ctx.arc(x, y, size * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawStar4(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ang: number): void {
  // 4-point star drawn with two crossed diamond rays
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang * 0.3);
  const r = size * 0.6;
  const w = size * 0.16;
  ctx.beginPath();
  ctx.moveTo(0, -r); ctx.lineTo(w, 0); ctx.lineTo(0, r); ctx.lineTo(-w, 0); ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r, 0); ctx.lineTo(0, -w); ctx.lineTo(r, 0); ctx.lineTo(0, w); ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSparkTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ang: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.6);
  ctx.lineTo(size * 0.48, size * 0.38);
  ctx.lineTo(-size * 0.48, size * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
