import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { TerrainType, WorldState } from '../sim/types';
import { Camera } from './camera';

const TERRAIN_PALETTE: Record<TerrainType, { base: string; wash: string; ink: number; detail: number }> = {
  plain:    { base: '#cfe89b', wash: '#eff8be', ink: 0x5f8f45, detail: 0xfff4b3 },
  forest:   { base: '#87c276', wash: '#bddf8b', ink: 0x2f6f44, detail: 0xd9ef9e },
  hill:     { base: '#d2bf86', wash: '#ead69c', ink: 0x8a7044, detail: 0xffe0a2 },
  mountain: { base: '#aaa18a', wash: '#ccc3a8', ink: 0x5a5248, detail: 0xf1e4bd },
  lake:     { base: '#75cce8', wash: '#ace8f5', ink: 0x317c9d, detail: 0xffffff },
  river:    { base: '#86d9ef', wash: '#beedf7', ink: 0x3a89a5, detail: 0xffffff },
  marsh:    { base: '#abc38d', wash: '#d5dda0', ink: 0x57764f, detail: 0xf4e7a5 },
  sand:     { base: '#eedc9b', wash: '#fff0b8', ink: 0xa48343, detail: 0xffffff },
  snow:     { base: '#edf7fb', wash: '#ffffff', ink: 0x8193a3, detail: 0xbfe8f6 },
};

const TERRAIN_PAINT_ORDER: TerrainType[] = ['plain', 'sand', 'marsh', 'hill', 'forest', 'mountain', 'snow', 'river', 'lake'];

interface TerrainRegion {
  terrain: TerrainType;
  tiles: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function numToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shade(hex: string, f: number): number {
  const h = hex.replace('#', '');
  const r = Math.min(255, Math.round(Number.parseInt(h.slice(0, 2), 16) * f));
  const g = Math.min(255, Math.round(Number.parseInt(h.slice(2, 4), 16) * f));
  const b = Math.min(255, Math.round(Number.parseInt(h.slice(4, 6), 16) * f));
  return (r << 16) + (g << 8) + b;
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

function paintSoftEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  alpha: number,
): void {
  const [r, g, b] = hexToRgb(color);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
  gradient.addColorStop(0.66, `rgba(${r}, ${g}, ${b}, ${alpha * 0.42})`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function paintMaskSplat(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angle: number,
): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
  ctx.fill();
}

function clearCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function organicGraphicsLine(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  amp: number,
  seed: number,
  style: { width: number; color: number; alpha: number },
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const a = (tileRand(seed, 0, 1) - 0.5) * amp;
  const b = (tileRand(seed, 0, 2) - 0.5) * amp;
  const mx = (x0 + x1) * 0.5 + nx * a;
  const my = (y0 + y1) * 0.5 + ny * a;
  g.moveTo(x0, y0)
    .quadraticCurveTo(x0 + dx * 0.24 + nx * b, y0 + dy * 0.24 + ny * b, mx, my)
    .quadraticCurveTo(x0 + dx * 0.76 - nx * b, y0 + dy * 0.76 - ny * b, x1, y1)
    .stroke(style);
}

export class PixiMap {
  private app: Application;
  private root = new Container();
  private terrainSprite = new Sprite(Texture.EMPTY);
  private territorySprite = new Sprite(Texture.EMPTY);
  private coastline = new Graphics();
  private detail = new Graphics();
  private sea = new Graphics();
  private lastTerritoryKey = '';

  constructor(private canvas: HTMLCanvasElement) {
    this.app = new Application();
  }

  async init(): Promise<void> {
    await this.app.init({
      canvas: this.canvas,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      powerPreference: 'high-performance',
    });
    this.app.stage.addChild(this.sea, this.root);
    this.root.addChild(this.terrainSprite, this.territorySprite, this.coastline, this.detail);
  }

  resize(): void {
    const r = (this.canvas.parentElement ?? this.canvas).getBoundingClientRect();
    this.app.renderer.resize(Math.floor(r.width), Math.floor(r.height));
    this.drawSea(r.width, r.height);
  }

  setWorld(world: WorldState): void {
    this.lastTerritoryKey = '';
    this.drawTerrain(world);
    this.drawCoastline(world);
    this.drawDetails(world);
  }

  render(world: WorldState, _selected: string | null, _hoveredTile: number | null, cam: Camera): void {
    this.root.position.set(cam.vw / 2 - cam.x * cam.scale, cam.vh / 2 - cam.y * cam.scale);
    this.root.scale.set(cam.scale);
    const territoryKey = this.territoryKey(world);
    if (this.lastTerritoryKey !== territoryKey) {
      this.drawTerritory(world);
      this.lastTerritoryKey = territoryKey;
    }
    this.app.renderer.render(this.app.stage);
  }

  private territoryKey(world: WorldState): string {
    let key = `${world.width}x${world.height}|`;
    for (const tile of world.tiles) {
      const owner = tile.owner;
      key += owner && world.nations[owner]?.alive ? owner : '-';
      key += ',';
    }
    return key;
  }

  private drawSea(width: number, height: number): void {
    this.sea.clear();
    this.sea.rect(0, 0, width, height).fill({ color: 0x9fd6df, alpha: 1 });
    this.sea.rect(0, 0, width, height * 0.48).fill({ color: 0xd0f0ee, alpha: 0.52 });
    this.sea.rect(0, height * 0.45, width, height * 0.55).fill({ color: 0x80bfd2, alpha: 0.22 });
    const band = 38;
    for (let y = -band; y < height + band; y += band) {
      this.sea
        .moveTo(0, y)
        .quadraticCurveTo(width * 0.25, y + 5, width * 0.5, y)
        .quadraticCurveTo(width * 0.75, y - 5, width, y)
        .stroke({ width: 1.1, color: 0xffffff, alpha: 0.08 });
    }
  }

  private drawTerrain(world: WorldState): void {
    const texture = this.paintTerrainTexture(world);
    this.terrainSprite.texture = texture;
    this.terrainSprite.position.set(0, 0);
    this.terrainSprite.width = world.width;
    this.terrainSprite.height = world.height;
  }

  private paintTerrainTexture(world: WorldState): Texture {
    const pxPerTile = 18;
    const width = world.width * pxPerTile;
    const height = world.height * pxPerTile;
    const canvas = clearCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#cdeaa8';
    ctx.fillRect(0, 0, width, height);

    for (const terrain of TERRAIN_PAINT_ORDER) {
      this.paintTerrainField(ctx, world, terrain, pxPerTile, width, height);
    }

    const regions = this.buildTerrainRegions(world);
    for (const region of regions) {
      if (region.tiles.length < 3) continue;
      const p = TERRAIN_PALETTE[region.terrain];
      const w = region.maxX - region.minX + 1;
      const h = region.maxY - region.minY + 1;
      const anchor = region.tiles[(tileRand(region.tiles.length, world.seed, region.tiles[0]) * region.tiles.length) | 0] ?? region.tiles[0];
      const cx = (region.minX + w * (0.45 + tileRand(anchor, world.seed, 811) * 0.18)) * pxPerTile;
      const cy = (region.minY + h * (0.45 + tileRand(anchor, world.seed, 812) * 0.18)) * pxPerTile;
      const rx = Math.max(1.2, w * (0.56 + tileRand(anchor, world.seed, 813) * 0.16)) * pxPerTile;
      const ry = Math.max(1.0, h * (0.54 + tileRand(anchor, world.seed, 814) * 0.16)) * pxPerTile;
      const alpha = isWater(region.terrain) ? 0.16 : region.terrain === 'plain' ? 0.14 : 0.20;
      paintSoftEllipse(ctx, cx, cy, rx, ry, p.wash, alpha);
    }

    for (let i = 0; i < world.tiles.length; i++) {
      const t = world.tiles[i];
      const x = i % world.width;
      const y = (i / world.width) | 0;
      const p = TERRAIN_PALETTE[t.terrain];
      const tone = 0.94 + t.tint * 0.10;
      const color = numToHex(shade(p.base, tone));
      for (let k = 0; k < 3; k++) {
        const cx = (x + 0.5 + (tileRand(i, world.seed, 100 + k) - 0.5) * 1.12) * pxPerTile;
        const cy = (y + 0.5 + (tileRand(i, world.seed, 110 + k) - 0.5) * 1.12) * pxPerTile;
        const rx = (0.78 + tileRand(i, world.seed, 120 + k) * 1.15) * pxPerTile;
        const ry = (0.58 + tileRand(i, world.seed, 130 + k) * 0.95) * pxPerTile;
        paintSoftEllipse(ctx, cx, cy, rx, ry, k === 0 ? color : p.wash, isWater(t.terrain) ? 0.14 : 0.12);
      }
      if (!isWater(t.terrain) && tileRand(i, world.seed, 36) > 0.48) {
        const cx = (x + tileRand(i, world.seed, 37)) * pxPerTile;
        const cy = (y + tileRand(i, world.seed, 38)) * pxPerTile;
        paintSoftEllipse(ctx, cx, cy, pxPerTile * 0.16, pxPerTile * 0.12, numToHex(p.detail), 0.10);
      }
    }

    ctx.globalCompositeOperation = 'soft-light';
    for (let i = 0; i < 2400; i++) {
      const n = tileRand(i, world.seed, 200);
      const x = tileRand(i, world.seed, 201) * width;
      const y = tileRand(i, world.seed, 202) * height;
      const r = 0.7 + tileRand(i, world.seed, 203) * 2.2;
      ctx.fillStyle = n > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(74,60,35,0.045)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    return Texture.from(canvas);
  }

  private paintTerrainField(
    ctx: CanvasRenderingContext2D,
    world: WorldState,
    terrain: TerrainType,
    pxPerTile: number,
    width: number,
    height: number,
  ): void {
    const mask = clearCanvas(width, height);
    const maskCtx = mask.getContext('2d')!;
    maskCtx.fillStyle = '#fff';
    for (let i = 0; i < world.tiles.length; i++) {
      if (world.tiles[i].terrain !== terrain) continue;
      const x = i % world.width;
      const y = (i / world.width) | 0;
      paintMaskSplat(
        maskCtx,
        (x + 0.5 + (tileRand(i, world.seed, 701) - 0.5) * 0.20) * pxPerTile,
        (y + 0.5 + (tileRand(i, world.seed, 702) - 0.5) * 0.20) * pxPerTile,
        (0.78 + tileRand(i, world.seed, 703) * 0.30) * pxPerTile,
        (0.72 + tileRand(i, world.seed, 704) * 0.34) * pxPerTile,
        (tileRand(i, world.seed, 705) - 0.5) * Math.PI,
      );
    }

    const softMask = clearCanvas(width, height);
    const softCtx = softMask.getContext('2d')!;
    softCtx.filter = `blur(${Math.round(pxPerTile * (isWater(terrain) ? 0.76 : 1.18))}px)`;
    softCtx.drawImage(mask, 0, 0);
    softCtx.filter = 'none';

    const layer = clearCanvas(width, height);
    const layerCtx = layer.getContext('2d')!;
    const p = TERRAIN_PALETTE[terrain];
    const strength = terrain === 'plain' ? 0.72 : isWater(terrain) ? 0.94 : 0.84;
    layerCtx.fillStyle = rgba(p.base, strength);
    layerCtx.fillRect(0, 0, width, height);
    layerCtx.globalCompositeOperation = 'destination-in';
    layerCtx.drawImage(softMask, 0, 0);
    layerCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, 0, 0);
  }

  private buildTerrainRegions(world: WorldState): TerrainRegion[] {
    const seen = new Uint8Array(world.tiles.length);
    const regions: TerrainRegion[] = [];
    const queue: number[] = [];
    for (let start = 0; start < world.tiles.length; start++) {
      if (seen[start]) continue;
      const terrain = world.tiles[start].terrain;
      seen[start] = 1;
      queue.length = 0;
      queue.push(start);
      let head = 0;
      const tiles: number[] = [];
      let minX = start % world.width;
      let maxX = minX;
      let minY = (start / world.width) | 0;
      let maxY = minY;
      while (head < queue.length) {
        const i = queue[head++];
        tiles.push(i);
        const x = i % world.width;
        const y = (i / world.width) | 0;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        const neighbors = [
          x > 0 ? i - 1 : -1,
          x < world.width - 1 ? i + 1 : -1,
          y > 0 ? i - world.width : -1,
          y < world.height - 1 ? i + world.width : -1,
        ];
        for (const n of neighbors) {
          if (n < 0 || seen[n] || world.tiles[n].terrain !== terrain) continue;
          seen[n] = 1;
          queue.push(n);
        }
      }
      regions.push({ terrain, tiles, minX, minY, maxX, maxY });
    }
    return regions;
  }

  private drawTerritory(world: WorldState): void {
    const texture = this.paintTerritoryTexture(world);
    this.territorySprite.texture = texture;
    this.territorySprite.position.set(0, 0);
    this.territorySprite.width = world.width;
    this.territorySprite.height = world.height;
  }

  private paintTerritoryTexture(world: WorldState): Texture {
    const pxPerTile = 18;
    const width = world.width * pxPerTile;
    const height = world.height * pxPerTile;
    const canvas = clearCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    const aliveOwners = Object.values(world.nations)
      .filter((nation) => nation.alive && nation.territory > 0)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const nation of aliveOwners) {
      const mask = clearCanvas(width, height);
      const maskCtx = mask.getContext('2d')!;
      maskCtx.fillStyle = '#fff';
      for (let i = 0; i < world.tiles.length; i++) {
        if (world.tiles[i].owner !== nation.id) continue;
        const x = i % world.width;
        const y = (i / world.width) | 0;
        for (let k = 0; k < 2; k++) {
          paintMaskSplat(
            maskCtx,
            (x + 0.5 + (tileRand(i, world.seed, 720 + k) - 0.5) * 0.34) * pxPerTile,
            (y + 0.5 + (tileRand(i, world.seed, 730 + k) - 0.5) * 0.34) * pxPerTile,
            (0.84 + tileRand(i, world.seed, 740 + k) * 0.34) * pxPerTile,
            (0.74 + tileRand(i, world.seed, 750 + k) * 0.36) * pxPerTile,
            (tileRand(i, world.seed, 760 + k) - 0.5) * Math.PI,
          );
        }
      }

      const softMask = clearCanvas(width, height);
      const softCtx = softMask.getContext('2d')!;
      softCtx.filter = `blur(${Math.round(pxPerTile * 0.88)}px)`;
      softCtx.drawImage(mask, 0, 0);
      softCtx.filter = 'none';

      const layer = clearCanvas(width, height);
      const layerCtx = layer.getContext('2d')!;
      layerCtx.fillStyle = rgba(nation.color, 0.28);
      layerCtx.fillRect(0, 0, width, height);
      layerCtx.globalCompositeOperation = 'destination-in';
      layerCtx.drawImage(softMask, 0, 0);
      layerCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(layer, 0, 0);

      const coreMask = clearCanvas(width, height);
      const coreCtx = coreMask.getContext('2d')!;
      coreCtx.filter = `blur(${Math.max(3, Math.round(pxPerTile * 0.42))}px)`;
      coreCtx.drawImage(mask, 0, 0);
      coreCtx.filter = 'none';

      const coreLayer = clearCanvas(width, height);
      const coreLayerCtx = coreLayer.getContext('2d')!;
      coreLayerCtx.fillStyle = rgba(nation.color, 0.09);
      coreLayerCtx.fillRect(0, 0, width, height);
      coreLayerCtx.globalCompositeOperation = 'destination-in';
      coreLayerCtx.drawImage(coreMask, 0, 0);
      coreLayerCtx.globalCompositeOperation = 'source-over';
      ctx.drawImage(coreLayer, 0, 0);
    }

    return Texture.from(canvas);
  }

  private drawCoastline(world: WorldState): void {
    this.coastline.clear();
    for (let i = 0; i < world.tiles.length; i++) {
      const x = i % world.width;
      const y = (i / world.width) | 0;
      const water = isWater(world.tiles[i].terrain);
      if (x < world.width - 1 && isWater(world.tiles[i + 1].terrain) !== water) {
        organicGraphicsLine(this.coastline, x + 1, y + 0.08, x + 1, y + 0.92, 0.11, i + world.seed * 13, { width: 0.060, color: 0xfff8e2, alpha: 0.62 });
        organicGraphicsLine(this.coastline, x + 0.95, y + 0.16, x + 0.95, y + 0.84, 0.08, i + world.seed * 17, { width: 0.026, color: 0x79b9cc, alpha: 0.20 });
      }
      if (y < world.height - 1 && isWater(world.tiles[i + world.width].terrain) !== water) {
        organicGraphicsLine(this.coastline, x + 0.08, y + 1, x + 0.92, y + 1, 0.11, i + world.seed * 19, { width: 0.060, color: 0xfff8e2, alpha: 0.62 });
        organicGraphicsLine(this.coastline, x + 0.16, y + 0.95, x + 0.84, y + 0.95, 0.08, i + world.seed * 23, { width: 0.026, color: 0x79b9cc, alpha: 0.20 });
      }
    }
  }

  private drawDetails(world: WorldState): void {
    this.detail.clear();
    const density: Record<TerrainType, number> = {
      plain: 0.045,
      forest: 0.54,
      hill: 0.26,
      mountain: 0.38,
      lake: 0.14,
      river: 0.18,
      marsh: 0.24,
      sand: 0.18,
      snow: 0.32,
    };
    for (const region of this.buildTerrainRegions(world)) {
      const count = Math.max(1, Math.min(region.tiles.length, Math.ceil(region.tiles.length * density[region.terrain])));
      for (let k = 0; k < count; k++) {
        const salt = region.tiles[0] + k * 97;
        const tile = region.tiles[(tileRand(salt, world.seed, 1001) * region.tiles.length) | 0] ?? region.tiles[0];
        const x = (tile % world.width) + tileRand(tile, world.seed, 1002 + k);
        const y = ((tile / world.width) | 0) + tileRand(tile, world.seed, 1003 + k);
        switch (region.terrain) {
        case 'forest':
          this.drawTree(x, y, 0.25 + tileRand(tile, world.seed, 1004 + k) * 0.12, salt, world.seed);
          break;
        case 'hill':
          this.drawHill(x, y);
          break;
        case 'mountain':
        case 'snow':
          this.drawRidge(x, y, region.terrain === 'snow');
          break;
        case 'lake':
        case 'river':
          this.drawWater(x, y, region.terrain === 'river');
          break;
        case 'marsh':
          this.drawReeds(x, y);
          break;
        case 'sand':
          this.drawDune(x, y);
          break;
        case 'plain':
          this.drawGrass(x, y, salt, world.seed);
          break;
        }
      }
    }
  }

  private drawTree(x: number, y: number, r: number, tile: number, seed: number): void {
    const trunkX = x + (tileRand(tile, seed, 41) - 0.5) * 0.06;
    this.detail
      .roundRect(trunkX - r * 0.08, y + r * 0.10, r * 0.16, r * 0.30, r * 0.05)
      .fill({ color: 0x7b5d38, alpha: 0.44 });
    const colors = [0x4f9a55, 0x6fbf68, 0x8bcf71];
    for (let k = 0; k < 4; k++) {
      const ox = (tileRand(tile, seed, 42 + k) - 0.5) * r * 0.85;
      const oy = (tileRand(tile, seed, 46 + k) - 0.5) * r * 0.58 - r * 0.14;
      this.detail
        .circle(x + ox, y + oy, r * (0.34 + tileRand(tile, seed, 52 + k) * 0.14))
        .fill({ color: colors[k % colors.length], alpha: 0.42 })
        .stroke({ width: 0.014, color: 0xfff8e2, alpha: 0.16 });
    }
  }

  private drawRidge(x: number, y: number, snow: boolean): void {
    const fill = snow ? 0xeef9ff : 0xb7aa86;
    const shadow = snow ? 0xa3bdca : 0x7f735e;
    const ink = snow ? 0x6f8493 : 0x4f463d;
    this.detail
      .moveTo(x - 0.34, y + 0.18)
      .lineTo(x - 0.06, y - 0.30)
      .lineTo(x + 0.16, y + 0.18)
      .closePath()
      .fill({ color: fill, alpha: snow ? 0.42 : 0.36 })
      .stroke({ width: 0.034, color: ink, alpha: 0.22 })
      .moveTo(x - 0.02, y + 0.15)
      .lineTo(x + 0.28, y - 0.22)
      .lineTo(x + 0.44, y + 0.15)
      .closePath()
      .fill({ color: shadow, alpha: snow ? 0.18 : 0.26 })
      .stroke({ width: 0.030, color: ink, alpha: 0.18 });
    if (snow) {
      this.detail
        .moveTo(x - 0.06, y - 0.30)
        .lineTo(x + 0.02, y - 0.10)
        .moveTo(x + 0.28, y - 0.22)
        .lineTo(x + 0.34, y - 0.05)
        .stroke({ width: 0.026, color: 0xffffff, alpha: 0.60 });
    }
  }

  private drawHill(x: number, y: number): void {
    this.detail
      .ellipse(x - 0.02, y + 0.10, 0.34, 0.16)
      .fill({ color: 0xe0ca8b, alpha: 0.20 })
      .moveTo(x - 0.34, y + 0.10)
      .quadraticCurveTo(x - 0.12, y - 0.18, x + 0.12, y + 0.10)
      .moveTo(x - 0.02, y + 0.12)
      .quadraticCurveTo(x + 0.18, y - 0.08, x + 0.36, y + 0.12)
      .stroke({ width: 0.036, color: 0x80673d, alpha: 0.20 });
  }

  private drawWater(x: number, y: number, river: boolean): void {
    this.detail
      .moveTo(x - 0.34, y)
      .quadraticCurveTo(x - 0.16, y - 0.10, x, y)
      .quadraticCurveTo(x + 0.16, y + 0.10, x + 0.34, y)
      .stroke({ width: 0.034, color: 0xffffff, alpha: river ? 0.44 : 0.32 });
    if (!river) {
      this.detail
        .moveTo(x - 0.24, y + 0.16)
        .quadraticCurveTo(x - 0.08, y + 0.08, x + 0.10, y + 0.16)
        .stroke({ width: 0.024, color: 0xffffff, alpha: 0.24 });
    }
  }

  private drawReeds(x: number, y: number): void {
    for (let k = 0; k < 3; k++) {
      const ox = (k - 1) * 0.10;
      this.detail
        .moveTo(x + ox, y + 0.18)
        .quadraticCurveTo(x + ox + 0.03, y - 0.02, x + ox + 0.02, y - 0.20)
        .stroke({ width: 0.028, color: 0x375c41, alpha: 0.24 });
    }
  }

  private drawDune(x: number, y: number): void {
    this.detail
      .moveTo(x - 0.30, y)
      .quadraticCurveTo(x - 0.02, y - 0.14, x + 0.30, y)
      .moveTo(x - 0.20, y + 0.16)
      .quadraticCurveTo(x + 0.02, y + 0.08, x + 0.24, y + 0.15)
      .stroke({ width: 0.028, color: 0x7c6030, alpha: 0.20 });
  }

  private drawGrass(x: number, y: number, tile: number, seed: number): void {
    this.detail
      .moveTo(x - 0.08, y + 0.16)
      .lineTo(x - 0.03, y - 0.10)
      .moveTo(x + 0.02, y + 0.16)
      .lineTo(x + 0.07, y - 0.04)
      .moveTo(x + 0.10, y + 0.16)
      .lineTo(x + 0.14, y - 0.10)
      .stroke({ width: 0.024, color: 0x4f8c3d, alpha: 0.20 });
    if (tileRand(tile, seed, 64) > 0.72) {
      const flower = tileRand(tile, seed, 65) > 0.5 ? 0xffd76b : 0xff9bb8;
      this.detail.circle(x + 0.16, y - 0.08, 0.035).fill({ color: flower, alpha: 0.42 });
    }
  }
}
