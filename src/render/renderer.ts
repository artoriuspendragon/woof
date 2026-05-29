import type { WorldState } from '../sim/types';
import { TERRAIN } from '../data/terrain';
import { RESOURCE } from '../data/resources';
import { SPECIES } from '../data/species';
import { Camera } from './camera';

export type FxKind = 'war' | 'celebrate' | 'build' | 'good' | 'epic' | 'fall' | 'select';
interface Particle { ang: number; spd: number; size: number; }
interface Fx { tile: number; born: number; ttl: number; kind: FxKind; parts: Particle[]; }
interface ArmyMotion { from: number; to: number; born: number; ttl: number; }
interface TerritoryMark { tile: number; born: number; color: string; }

const FX_CFG: Record<FxKind, { emoji: string; ring: string; pcolor: string; n: number; ttl: number; rise: boolean }> = {
  war:       { emoji: '⚔️', ring: '210,60,50',  pcolor: '#d23a2e', n: 7,  ttl: 1500, rise: false },
  celebrate: { emoji: '🎉', ring: '230,120,180', pcolor: '#ffcf4a', n: 12, ttl: 1900, rise: false },
  build:     { emoji: '🔨', ring: '150,120,80',  pcolor: '#c2a06a', n: 7,  ttl: 1500, rise: true },
  good:      { emoji: '🌾', ring: '120,200,120', pcolor: '#8fd06a', n: 9,  ttl: 1700, rise: true },
  epic:      { emoji: '✨', ring: '255,200,80',  pcolor: '#ffd24a', n: 14, ttl: 2200, rise: true },
  fall:      { emoji: '🏴', ring: '90,90,90',    pcolor: '#8a8a8a', n: 9,  ttl: 2000, rise: false },
  select:    { emoji: '✦', ring: '228,188,110', pcolor: '#e4bc6e', n: 8,  ttl: 900,  rise: true },
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
  private armyMotion = new Map<string, ArmyMotion>();
  private ownerSnapshot: Array<string | null> = [];
  private lastOwnerTick = -1;
  private territoryMarks: TerritoryMark[] = [];
  private w = 0; private h = 0;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private baseLayerEnabled = true;

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
    this.armyMotion.clear();
    this.ownerSnapshot = world.tiles.map((t) => t.owner);
    this.lastOwnerTick = world.tick;
    this.territoryMarks = [];

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

  setBaseLayerEnabled(enabled: boolean): void {
    this.baseLayerEnabled = enabled;
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

  render(world: WorldState, selected: string | null, hoveredTile: number | null = null): void {
    const ctx = this.ctx, cam = this.cam;
    this.trackTerritoryChanges(world);
    ctx.clearRect(0, 0, cam.vw, cam.vh);
    if (this.baseLayerEnabled) {
      // 海洋底色
      const sea = ctx.createLinearGradient(0, 0, 0, cam.vh);
      sea.addColorStop(0, '#c7e7ef');
      sea.addColorStop(0.55, '#acd3df');
      sea.addColorStop(1, '#93bfcc');
      ctx.fillStyle = sea;
      ctx.fillRect(0, 0, cam.vw, cam.vh);

      const [dx0, dy0] = cam.worldToScreen(0, 0);
      const [dx1, dy1] = cam.worldToScreen(world.width, world.height);

      // 地形底图
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.terrainCanvas, dx0, dy0, dx1 - dx0, dy1 - dy0);

      // 地貌笔触与海岸线：让 1px 地图底图像一个会呼吸的箱庭，而不只是色块。
      this.drawCoastline(world);
      this.drawTerrainDetails(world);

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
    }

    // 国界描边（仅可视范围）
    this.drawBorders(world, selected);

    // 选中国家光晕（在城市标记之下）
    if (selected && world.nations[selected]?.alive) this.drawSelectionGlow(world, selected);

    // 资源 + 城市 + 首都标记
    this.drawMarkers(world);

    // 悬停目标：轻轻告诉玩家"这里可点"，尤其是神明干预模式。
    if (hoveredTile !== null) this.drawHoverTile(world, hoveredTile);

    // 占领/易主提示：让玩家看见前线怎么推进，而不是颜色突然变了。
    this.drawTerritoryMarks(world);

    // 军队（行军中的实体）
    this.drawArmies(world);

    // 进行中的战争连线（持续动画）
    this.drawWarLinks(world);

    // 一次性事件特效
    this.drawFx(world);

    this.drawVignette();
  }

  private visibleBounds(world: WorldState, pad = 1): { x0: number; y0: number; x1: number; y1: number } {
    const cam = this.cam;
    const [wx0, wy0] = cam.screenToWorld(-cam.scale * pad, -cam.scale * pad);
    const [wx1, wy1] = cam.screenToWorld(cam.vw + cam.scale * pad, cam.vh + cam.scale * pad);
    return {
      x0: Math.max(0, Math.floor(Math.min(wx0, wx1))),
      y0: Math.max(0, Math.floor(Math.min(wy0, wy1))),
      x1: Math.min(world.width - 1, Math.ceil(Math.max(wx0, wx1))),
      y1: Math.min(world.height - 1, Math.ceil(Math.max(wy0, wy1))),
    };
  }

  private trackTerritoryChanges(world: WorldState): void {
    if (this.ownerSnapshot.length !== world.tiles.length) {
      this.ownerSnapshot = world.tiles.map((t) => t.owner);
      this.lastOwnerTick = world.tick;
      return;
    }
    if (this.lastOwnerTick === world.tick) return;
    const now = performance.now();
    for (let i = 0; i < world.tiles.length; i++) {
      const owner = world.tiles[i].owner;
      if (this.ownerSnapshot[i] === owner) continue;
      this.ownerSnapshot[i] = owner;
      if (owner && world.nations[owner]?.alive) {
        this.territoryMarks.push({ tile: i, born: now, color: world.nations[owner].color });
      }
    }
    this.lastOwnerTick = world.tick;
    if (this.territoryMarks.length > 80) this.territoryMarks.splice(0, this.territoryMarks.length - 80);
  }

  private drawTerritoryMarks(world: WorldState): void {
    const ctx = this.ctx, cam = this.cam, now = performance.now(), s = cam.scale;
    const ttl = 2200;
    this.territoryMarks = this.territoryMarks.filter((m) => now - m.born < ttl);
    if (this.territoryMarks.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const mark of this.territoryMarks) {
      const age = (now - mark.born) / ttl;
      const x = mark.tile % world.width, y = (mark.tile / world.width) | 0;
      const [sx, sy] = cam.worldToScreen(x + 0.5, y + 0.5);
      if (sx < -s || sy < -s || sx > cam.vw + s || sy > cam.vh + s) continue;
      const alpha = Math.max(0, 1 - age);
      const bob = Math.sin(age * Math.PI) * s * 0.14;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(58, 42, 28, 0.46)';
      ctx.lineWidth = Math.max(1, s * 0.065);
      ctx.beginPath();
      ctx.moveTo(sx - s * 0.18, sy + s * 0.32 - bob);
      ctx.lineTo(sx - s * 0.18, sy - s * 0.34 - bob);
      ctx.stroke();
      ctx.fillStyle = mark.color;
      ctx.strokeStyle = 'rgba(255, 248, 226, 0.76)';
      ctx.lineWidth = Math.max(0.9, s * 0.045);
      ctx.beginPath();
      ctx.moveTo(sx - s * 0.16, sy - s * 0.34 - bob);
      ctx.lineTo(sx + s * 0.34, sy - s * 0.20 - bob);
      ctx.lineTo(sx + s * 0.12, sy + s * 0.03 - bob);
      ctx.lineTo(sx + s * 0.36, sy + s * 0.22 - bob);
      ctx.lineTo(sx - s * 0.16, sy + s * 0.12 - bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = `rgba(255, 248, 226, ${0.24 * alpha})`;
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(sx - s * 0.45, sy + s * 0.46);
      ctx.quadraticCurveTo(sx, sy + s * (0.56 + age * 0.16), sx + s * 0.48, sy + s * 0.40);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private armyVisualWorldPosition(id: string, fromTile: number, toTile: number, world: WorldState, now: number): [number, number] {
    if (fromTile === toTile) return [(toTile % world.width) + 0.5, ((toTile / world.width) | 0) + 0.5];
    const current = this.armyMotion.get(id);
    if (!current || current.from !== fromTile || current.to !== toTile) {
      this.armyMotion.set(id, { from: fromTile, to: toTile, born: now, ttl: 1350 });
    }
    const motion = this.armyMotion.get(id)!;
    const t = Math.max(0, Math.min(1, (now - motion.born) / motion.ttl));
    const eased = t * t * (3 - 2 * t);
    const fx = (fromTile % world.width) + 0.5;
    const fy = ((fromTile / world.width) | 0) + 0.5;
    const tx = (toTile % world.width) + 0.5;
    const ty = ((toTile / world.width) | 0) + 0.5;
    return [fx + (tx - fx) * eased, fy + (ty - fy) * eased];
  }

  private drawCoastline(world: WorldState): void {
    const ctx = this.ctx, cam = this.cam, s = cam.scale;
    if (s < 5) return;
    const b = this.visibleBounds(world, 1);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255, 248, 226, 0.42)';
    ctx.lineWidth = Math.max(1, s * 0.075);
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const i = y * world.width + x;
        const water = isWater(world.tiles[i].terrain);
        const [sx, sy] = cam.worldToScreen(x, y);
        if (x < world.width - 1 && isWater(world.tiles[i + 1].terrain) !== water) organicLine(ctx, sx + s, sy + 1, sx + s, sy + s - 1, s * 0.10, i + world.seed * 13);
        if (y < world.height - 1 && isWater(world.tiles[i + world.width].terrain) !== water) organicLine(ctx, sx + 1, sy + s, sx + s - 1, sy + s, s * 0.10, i + world.seed * 17);
      }
    }
    ctx.restore();
  }

  private drawTerrainDetails(world: WorldState): void {
    const ctx = this.ctx, cam = this.cam, s = cam.scale;
    if (s < 7) return;
    const b = this.visibleBounds(world, 1);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        const i = y * world.width + x;
        const t = world.tiles[i];
        const density = tileRand(i, world.seed, 2);
        if (s < 12 && density < 0.45) continue;
        if (s < 9 && density < 0.7) continue;
        const [cx, cy] = cam.worldToScreen(x + 0.5, y + 0.5);
        const jitterX = (tileRand(i, world.seed, 3) - 0.5) * s * 0.22;
        const jitterY = (tileRand(i, world.seed, 4) - 0.5) * s * 0.22;
        switch (t.terrain) {
          case 'forest':
            drawTreeTuft(ctx, cx + jitterX, cy + jitterY, s, t.tint);
            break;
          case 'mountain':
          case 'snow':
            drawRidge(ctx, cx + jitterX, cy + jitterY, s, t.terrain === 'snow');
            break;
          case 'hill':
            drawHillMark(ctx, cx + jitterX, cy + jitterY, s);
            break;
          case 'lake':
          case 'river':
            drawWaterMark(ctx, cx + jitterX, cy + jitterY, s, t.terrain === 'river');
            break;
          case 'marsh':
            drawReeds(ctx, cx + jitterX, cy + jitterY, s);
            break;
          case 'sand':
            drawDune(ctx, cx + jitterX, cy + jitterY, s);
            break;
          case 'plain':
            if (density > 0.78) drawGrass(ctx, cx + jitterX, cy + jitterY, s);
            break;
        }
      }
    }
    ctx.restore();
  }

  private drawHoverTile(world: WorldState, tile: number): void {
    if (tile < 0 || tile >= world.tiles.length) return;
    const ctx = this.ctx, cam = this.cam, s = cam.scale;
    const x = tile % world.width, y = (tile / world.width) | 0;
    const [sx, sy] = cam.worldToScreen(x, y);
    if (sx < -s || sy < -s || sx > cam.vw + s || sy > cam.vh + s) return;
    const owner = world.tiles[tile].owner;
    const color = owner && world.nations[owner]?.alive ? world.nations[owner].color : '#fff8e6';
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 220);
    ctx.save();
    ctx.fillStyle = `rgba(255, 248, 226, ${0.10 + pulse * 0.06})`;
    ctx.fillRect(sx + 1, sy + 1, Math.max(0, s - 2), Math.max(0, s - 2));
    ctx.lineWidth = Math.max(1.2, s * 0.10);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.42 + pulse * 0.28;
    ctx.strokeRect(sx + ctx.lineWidth / 2, sy + ctx.lineWidth / 2, s - ctx.lineWidth, s - ctx.lineWidth);
    ctx.restore();
  }

  private drawVignette(): void {
    const ctx = this.ctx, cam = this.cam;
    const r = Math.max(cam.vw, cam.vh) * 0.72;
    const g = ctx.createRadialGradient(cam.vw / 2, cam.vh / 2, r * 0.18, cam.vw / 2, cam.vh / 2, r);
    g.addColorStop(0, 'rgba(255, 255, 255, 0)');
    g.addColorStop(1, 'rgba(42, 28, 14, 0.14)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cam.vw, cam.vh);
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
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = Math.max(0.55, s * 0.028);
    for (let i = 0; i < world.tiles.length; i++) {
      const owner = world.tiles[i].owner;
      if (!owner || !world.nations[owner]?.alive) continue;
      if (owner === selected) continue;
      const x = i % world.width, y = (i / world.width) | 0;
      const [sx, sy] = cam.worldToScreen(x, y);
      if (sx < -s || sy < -s || sx > cam.vw + s || sy > cam.vh + s) continue;
      ctx.strokeStyle = shade(world.nations[owner].color, 0.58);
      // 右、下两条边即可覆盖全部相邻关系
      const right = i + 1, down = i + world.width;
      const wobble = Math.min(s * 0.16, 4.5);
      if (x < world.width - 1 && world.tiles[right].owner !== owner) organicLine(ctx, sx + s, sy, sx + s, sy + s, wobble, i + world.seed * 23);
      if (x > 0 && world.tiles[i - 1].owner !== owner) organicLine(ctx, sx, sy, sx, sy + s, wobble, i + world.seed * 29);
      if (y < world.height - 1 && world.tiles[down].owner !== owner) organicLine(ctx, sx, sy + s, sx + s, sy + s, wobble, i + world.seed * 31);
      if (y > 0 && world.tiles[i - world.width].owner !== owner) organicLine(ctx, sx, sy, sx + s, sy, wobble, i + world.seed * 37);
    }
    ctx.restore();
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
        if (isCap) {
          drawCastle(ctx, sx, sy, size, color);
          if (s >= 13) drawCapitalSeal(ctx, sx, sy - size * 0.72, Math.max(7, size * 0.26), SPECIES[world.nations[owner].species].emoji);
        }
        else if (lvl >= 2) drawCityCluster(ctx, sx, sy, size, color);
        else               drawCottage(ctx, sx, sy, size, color);
        // 围攻进度环：被围之城外缘画一段渐增的蜡红弧
        const siege = world.sieges[i];
        if (siege && siege > 0) {
          const fallNeed = isCap ? 140 : (35 + 35 * (lvl - 1));
          drawSiegeRing(ctx, sx, sy, size, Math.min(1, siege / fallNeed));
        }
      } else {
        const size = Math.max(5, s * (isCap ? 0.82 : lvl >= 2 ? 0.66 : 0.52));
        drawMiniSettlement(ctx, sx, sy, size, color, isCap, lvl);
      }
    }
  }

  private drawArmies(world: WorldState): void {
    const ctx = this.ctx, cam = this.cam, s = cam.scale, now = performance.now();
    const liveIds = new Set<string>();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const a of Object.values(world.armies)) {
      const n = world.nations[a.nation];
      if (!n?.alive) continue;
      liveIds.add(a.id);
      const [wx, wy] = this.armyVisualWorldPosition(a.id, a.prevTile, a.tile, world, now);
      const [sx, sy] = cam.worldToScreen(wx, wy);
      if (sx < -s || sy < -s || sx > cam.vw + s || sy > cam.vh + s) continue;

      // 行军轨迹（上一格 → 当前帧位置）
      if (a.prevTile !== a.tile) {
        const [px, py] = cam.worldToScreen((a.prevTile % world.width) + 0.5, ((a.prevTile / world.width) | 0) + 0.5);
        ctx.strokeStyle = 'rgba(58, 42, 28, 0.28)'; ctx.lineWidth = Math.max(1, s * 0.055);
        ctx.setLineDash([4, 3]); line(ctx, px, py, sx, sy); ctx.setLineDash([]);
      }

      const r = Math.max(5, s * 0.42) * (a.size > 150 ? 1.25 : a.size > 60 ? 1.0 : 0.85);
      const low = a.supply < 30;

      drawWarBanner(ctx, sx, sy, r, n.color, low);

      if (s >= 9) {
        ctx.font = `${Math.round(r * 1.4)}px serif`;
        ctx.fillText(SPECIES[n.species].emoji, sx, sy - r * 0.08);
        if (low && s >= 11) {
          // 缺粮标记：盾右上挂一颗蜡红水印
          drawSupplyMark(ctx, sx + r * 0.85, sy - r * 0.75, Math.max(5, r * 0.38));
        }
      }
    }
    for (const id of this.armyMotion.keys()) if (!liveIds.has(id)) this.armyMotion.delete(id);
  }

  private drawSelectionGlow(world: WorldState, selected: string): void {
    const ctx = this.ctx, cam = this.cam, s = cam.scale;
    const now = performance.now();
    const pulse = 0.55 + 0.45 * Math.sin(now / 380);
    const width = Math.max(1, Math.ceil(cam.vw));
    const height = Math.max(1, Math.ceil(cam.vh));
    const mask = document.createElement('canvas');
    mask.width = width;
    mask.height = height;
    const maskCtx = mask.getContext('2d')!;
    maskCtx.fillStyle = '#fff';
    for (let i = 0; i < world.tiles.length; i++) {
      if (world.tiles[i].owner !== selected) continue;
      const x = i % world.width, y = (i / world.width) | 0;
      const [sx, sy] = cam.worldToScreen(x, y);
      if (sx < -s || sy < -s || sx > cam.vw + s || sy > cam.vh + s) continue;
      maskCtx.beginPath();
      maskCtx.moveTo(sx + s * 0.50, sy - s * 0.18);
      maskCtx.lineTo(sx + s * 1.18, sy + s * 0.20);
      maskCtx.lineTo(sx + s * 1.05, sy + s * 0.88);
      maskCtx.lineTo(sx + s * 0.44, sy + s * 1.20);
      maskCtx.lineTo(sx - s * 0.14, sy + s * 0.78);
      maskCtx.lineTo(sx - s * 0.06, sy + s * 0.12);
      maskCtx.closePath();
      maskCtx.fill();
    }

    const soft = document.createElement('canvas');
    soft.width = width;
    soft.height = height;
    const softCtx = soft.getContext('2d')!;
    softCtx.filter = `blur(${Math.max(6, s * 0.34)}px)`;
    softCtx.drawImage(mask, 0, 0);
    softCtx.filter = 'none';

    const glow = document.createElement('canvas');
    glow.width = width;
    glow.height = height;
    const glowCtx = glow.getContext('2d')!;
    glowCtx.fillStyle = `rgba(236, 193, 91, ${0.24 + pulse * 0.08})`;
    glowCtx.fillRect(0, 0, width, height);
    glowCtx.globalCompositeOperation = 'destination-in';
    glowCtx.drawImage(soft, 0, 0);

    const core = document.createElement('canvas');
    core.width = width;
    core.height = height;
    const coreCtx = core.getContext('2d')!;
    coreCtx.filter = `blur(${Math.max(2, s * 0.12)}px)`;
    coreCtx.drawImage(mask, 0, 0);
    coreCtx.filter = 'none';

    const coreLayer = document.createElement('canvas');
    coreLayer.width = width;
    coreLayer.height = height;
    const coreLayerCtx = coreLayer.getContext('2d')!;
    coreLayerCtx.fillStyle = `rgba(255, 246, 203, ${0.16 + pulse * 0.10})`;
    coreLayerCtx.fillRect(0, 0, width, height);
    coreLayerCtx.globalCompositeOperation = 'destination-in';
    coreLayerCtx.drawImage(core, 0, 0);

    glowCtx.globalCompositeOperation = 'source-over';
    glowCtx.drawImage(coreLayer, 0, 0);

    ctx.drawImage(glow, 0, 0, cam.vw, cam.vh);
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

      // Short brush-burst strokes read better on the painted map than full UI rings.
      const r = (6 + t * 24) * unit;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(tileRand(f.tile, world.seed, 88) * Math.PI);
      ctx.strokeStyle = `rgba(${cfg.ring},${(1 - t) * 0.42})`;
      ctx.lineWidth = Math.max(0.8, 2.1 * (1 - t));
      ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        const a = (Math.PI * 2 * k) / 5 + tileRand(f.tile, world.seed, 90 + k) * 0.42;
        const inner = r * (0.18 + tileRand(f.tile, world.seed, 96 + k) * 0.18);
        const outer = r * (0.54 + tileRand(f.tile, world.seed, 102 + k) * 0.38);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
        ctx.quadraticCurveTo(
          Math.cos(a + 0.18) * ((inner + outer) * 0.52),
          Math.sin(a + 0.18) * ((inner + outer) * 0.52),
          Math.cos(a + 0.05) * outer,
          Math.sin(a + 0.05) * outer,
        );
        ctx.stroke();
      }
      ctx.restore();

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

function organicLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, amp: number, seed: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const a = (tileRand(seed, 0, 1) - 0.5) * amp;
  const b = (tileRand(seed, 0, 2) - 0.5) * amp;
  const mx = (x0 + x1) * 0.5 + nx * a;
  const my = (y0 + y1) * 0.5 + ny * a;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(
    x0 + dx * 0.24 + nx * b,
    y0 + dy * 0.24 + ny * b,
    mx,
    my,
  );
  ctx.quadraticCurveTo(
    x0 + dx * 0.76 - nx * b,
    y0 + dy * 0.76 - ny * b,
    x1,
    y1,
  );
  ctx.stroke();
}

function shade(hex: string, f: number): string {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.slice(0, 2), 16) * f);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * f);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * f);
  return `rgb(${r},${g},${b})`;
}

function isWater(terrain: string): boolean {
  return terrain === 'lake' || terrain === 'river';
}

function tileRand(i: number, seed: number, salt: number): number {
  let h = (Math.imul(i + 1, 1103515245) + Math.imul(seed ^ salt, 12345)) | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519) | 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ────────────────────────────────────────────────────────────
// Map-token icon vocabulary (all hand-drawn paths, no emoji)
// ────────────────────────────────────────────────────────────

// Constants used by all icons
const INK_OUTLINE = '#fff8e6';   // cream outline — matches paper-0
const INK_DEEP    = '#3a2a1c';   // deep walnut — for ink details
const GOLD        = '#caa055';

function drawTreeTuft(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, tint: number): void {
  const r = size * (0.11 + tint * 0.04);
  ctx.save();
  ctx.fillStyle = 'rgba(38, 86, 49, 0.30)';
  ctx.strokeStyle = 'rgba(255, 248, 226, 0.14)';
  ctx.lineWidth = Math.max(0.7, size * 0.035);
  for (let k = 0; k < 3; k++) {
    const ox = (k - 1) * r * 1.25;
    const oy = k === 1 ? -r * 0.55 : r * 0.15;
    ctx.beginPath();
    ctx.moveTo(sx + ox, sy + oy - r * 1.35);
    ctx.lineTo(sx + ox + r, sy + oy + r * 0.55);
    ctx.lineTo(sx + ox - r, sy + oy + r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawRidge(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, snow: boolean): void {
  const w = size * 0.44;
  const h = size * 0.34;
  ctx.save();
  ctx.strokeStyle = snow ? 'rgba(93, 111, 125, 0.26)' : 'rgba(64, 51, 39, 0.24)';
  ctx.lineWidth = Math.max(1, size * 0.06);
  ctx.beginPath();
  ctx.moveTo(sx - w, sy + h * 0.55);
  ctx.lineTo(sx - w * 0.18, sy - h);
  ctx.lineTo(sx + w * 0.22, sy + h * 0.55);
  ctx.moveTo(sx - w * 0.10, sy + h * 0.48);
  ctx.lineTo(sx + w * 0.55, sy - h * 0.55);
  ctx.lineTo(sx + w, sy + h * 0.48);
  ctx.stroke();
  if (snow) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.46)';
    ctx.lineWidth = Math.max(0.8, size * 0.035);
    ctx.beginPath();
    ctx.moveTo(sx - w * 0.18, sy - h);
    ctx.lineTo(sx - w * 0.02, sy - h * 0.38);
    ctx.moveTo(sx + w * 0.55, sy - h * 0.55);
    ctx.lineTo(sx + w * 0.66, sy - h * 0.06);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHillMark(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(88, 66, 37, 0.18)';
  ctx.lineWidth = Math.max(0.9, size * 0.045);
  ctx.beginPath();
  ctx.arc(sx - size * 0.08, sy + size * 0.10, size * 0.30, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx + size * 0.16, sy + size * 0.14, size * 0.22, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  ctx.restore();
}

function drawWaterMark(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, river: boolean): void {
  ctx.save();
  ctx.strokeStyle = river ? 'rgba(255, 255, 255, 0.36)' : 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = Math.max(0.8, size * 0.04);
  const w = size * (river ? 0.34 : 0.42);
  for (let k = 0; k < (river ? 1 : 2); k++) {
    const y = sy + (k - 0.5) * size * 0.18;
    ctx.beginPath();
    ctx.moveTo(sx - w, y);
    ctx.quadraticCurveTo(sx - w * 0.45, y - size * 0.12, sx, y);
    ctx.quadraticCurveTo(sx + w * 0.45, y + size * 0.12, sx + w, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawReeds(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(55, 92, 65, 0.24)';
  ctx.lineWidth = Math.max(0.8, size * 0.04);
  for (let k = 0; k < 3; k++) {
    const x = sx + (k - 1) * size * 0.10;
    ctx.beginPath();
    ctx.moveTo(x, sy + size * 0.20);
    ctx.quadraticCurveTo(x + size * 0.04, sy - size * 0.05, x + size * 0.02, sy - size * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDune(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(124, 96, 48, 0.20)';
  ctx.lineWidth = Math.max(0.8, size * 0.035);
  ctx.beginPath();
  ctx.moveTo(sx - size * 0.30, sy + size * 0.03);
  ctx.quadraticCurveTo(sx - size * 0.05, sy - size * 0.14, sx + size * 0.30, sy + size * 0.02);
  ctx.moveTo(sx - size * 0.22, sy + size * 0.20);
  ctx.quadraticCurveTo(sx + size * 0.02, sy + size * 0.08, sx + size * 0.24, sy + size * 0.19);
  ctx.stroke();
  ctx.restore();
}

function drawGrass(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(67, 111, 55, 0.18)';
  ctx.lineWidth = Math.max(0.8, size * 0.035);
  ctx.beginPath();
  ctx.moveTo(sx - size * 0.08, sy + size * 0.18);
  ctx.lineTo(sx - size * 0.03, sy - size * 0.12);
  ctx.moveTo(sx, sy + size * 0.18);
  ctx.lineTo(sx + size * 0.06, sy - size * 0.04);
  ctx.moveTo(sx + size * 0.08, sy + size * 0.18);
  ctx.lineTo(sx + size * 0.13, sy - size * 0.10);
  ctx.stroke();
  ctx.restore();
}

function drawCapitalSeal(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, icon: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(sx - r * 0.86, sy - r * 0.76, r * 1.72, r * 1.52, r * 0.20);
  ctx.fillStyle = 'rgba(251, 243, 220, 0.94)';
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.strokeStyle = 'rgba(58, 42, 28, 0.32)';
  ctx.stroke();
  ctx.font = `${Math.round(r * 1.2)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, sx, sy + r * 0.04);
  ctx.restore();
}

function drawMiniSettlement(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, color: string, isCap: boolean, lvl: number): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1, size * 0.16);
  ctx.strokeStyle = INK_OUTLINE;
  ctx.fillStyle = color;

  const w = size * (isCap ? 1.35 : lvl >= 2 ? 1.14 : 0.96);
  const h = size * (isCap ? 1.22 : 0.96);
  const roofTop = sy - h * 0.62;
  const wallTop = sy - h * 0.10;
  const wallBot = sy + h * 0.50;
  ctx.beginPath();
  ctx.moveTo(sx - w * 0.55, wallTop);
  ctx.lineTo(sx, roofTop);
  ctx.lineTo(sx + w * 0.55, wallTop);
  ctx.lineTo(sx + w * 0.42, wallTop);
  ctx.lineTo(sx + w * 0.42, wallBot);
  ctx.lineTo(sx - w * 0.42, wallBot);
  ctx.lineTo(sx - w * 0.42, wallTop);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (isCap) {
    ctx.strokeStyle = INK_DEEP;
    ctx.lineWidth = Math.max(0.8, size * 0.12);
    const poleX = sx + w * 0.28;
    ctx.beginPath();
    ctx.moveTo(poleX, roofTop + h * 0.05);
    ctx.lineTo(poleX, roofTop - h * 0.36);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(poleX, roofTop - h * 0.36);
    ctx.lineTo(poleX + w * 0.30, roofTop - h * 0.24);
    ctx.lineTo(poleX, roofTop - h * 0.12);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

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

// Siege progress arc: wax-red ring growing clockwise as the city's siege fills.
function drawSiegeRing(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, frac: number): void {
  if (frac <= 0) return;
  const w = size * 1.55;
  const h = Math.max(3, size * 0.18);
  const x = sx - w * 0.5;
  const y = sy + size * 0.82;
  ctx.save();
  ctx.fillStyle = 'rgba(168, 57, 44, 0.18)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#a8392c';
  ctx.fillRect(x, y, w * frac, h);
  ctx.restore();
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

function drawWarBanner(ctx: CanvasRenderingContext2D, sx: number, sy: number, r: number, color: string, low: boolean): void {
  const poleH = r * 2.25;
  const poleX = sx - r * 0.28;
  const top = sy - poleH * 0.48;
  const bot = sy + poleH * 0.48;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.1, r * 0.14);
  ctx.strokeStyle = low ? '#a8392c' : INK_DEEP;
  ctx.beginPath();
  ctx.moveTo(poleX, top);
  ctx.lineTo(poleX, bot);
  ctx.stroke();

  ctx.fillStyle = low ? shade(color, 0.85) : color;
  ctx.strokeStyle = INK_OUTLINE;
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.beginPath();
  ctx.moveTo(poleX, top + r * 0.08);
  ctx.lineTo(poleX + r * 1.35, top + r * 0.32);
  ctx.lineTo(poleX + r * 0.76, top + r * 0.78);
  ctx.lineTo(poleX + r * 1.26, top + r * 1.22);
  ctx.lineTo(poleX, top + r * 1.05);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Supply-cut marker: a small wax-red diamond with a white droplet glyph.
function drawSupplyMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
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

// Crossed daggers in a wax-red diamond badge (war-link midpoint).
function drawCrossedDaggers(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, pulse: number): void {
  ctx.save();
  ctx.translate(cx, cy);

  ctx.beginPath();
  ctx.moveTo(0, -size * 0.94);
  ctx.lineTo(size * 0.94, 0);
  ctx.lineTo(0, size * 0.94);
  ctx.lineTo(-size * 0.94, 0);
  ctx.closePath();
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

  ctx.beginPath();
  ctx.moveTo(0, -size * 0.20);
  ctx.lineTo(size * 0.20, 0);
  ctx.lineTo(0, size * 0.20);
  ctx.lineTo(-size * 0.20, 0);
  ctx.closePath();
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
  drawStar4(ctx, x, y, size * 0.72, ang);
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
