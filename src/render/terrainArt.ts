import type { TerrainType } from '../sim/types';

export type TerrainBrushId =
  | 'meadow' | 'forest' | 'hill' | 'mountain'
  | 'lake' | 'river' | 'marsh' | 'sand'
  | 'snow' | 'rock' | 'field' | 'coast';

interface AtlasCell { col: number; row: number; }
interface SourceRect { x: number; y: number; w: number; h: number; }

const ATLAS_URL = new URL('assets/art/terrain-brush-atlas.png', document.baseURI).href;
const COLS = 4;
const ROWS = 3;
const ALPHA_TRIM_THRESHOLD = 16;

const BRUSHES: Record<TerrainBrushId, AtlasCell> = {
  meadow: { col: 0, row: 0 },
  forest: { col: 1, row: 0 },
  hill: { col: 2, row: 0 },
  mountain: { col: 3, row: 0 },
  lake: { col: 0, row: 1 },
  river: { col: 1, row: 1 },
  marsh: { col: 2, row: 1 },
  sand: { col: 3, row: 1 },
  snow: { col: 0, row: 2 },
  rock: { col: 1, row: 2 },
  field: { col: 2, row: 2 },
  coast: { col: 3, row: 2 },
};

export const TERRAIN_BRUSH: Record<TerrainType, TerrainBrushId> = {
  plain: 'meadow',
  forest: 'forest',
  hill: 'hill',
  mountain: 'mountain',
  lake: 'lake',
  river: 'river',
  marsh: 'marsh',
  sand: 'sand',
  snow: 'snow',
};

const atlas = new Image();
let loaded = false;
let version = 0;
let trims: Partial<Record<TerrainBrushId, SourceRect>> = {};

atlas.onload = () => {
  loaded = true;
  trims = buildTrimmedRects();
  version += 1;
};
atlas.src = ATLAS_URL;

export function isTerrainArtReady(): boolean {
  return loaded && atlas.naturalWidth > 0 && atlas.naturalHeight > 0;
}

export function terrainArtVersion(): number {
  return version;
}

export function drawTerrainBrush(
  ctx: CanvasRenderingContext2D,
  id: TerrainBrushId,
  cx: number,
  cy: number,
  maxWidth: number,
  maxHeight = maxWidth,
  opts: { alpha?: number; rotation?: number; flip?: boolean } = {},
): boolean {
  if (!isTerrainArtReady()) return false;
  const source = trims[id] ?? sourceRectFor(id);
  if (source.w <= 0 || source.h <= 0) return false;

  const scale = Math.min(maxWidth / source.w, maxHeight / source.h);
  const dw = source.w * scale;
  const dh = source.h * scale;

  ctx.save();
  ctx.translate(cx, cy);
  if (opts.rotation) ctx.rotate(opts.rotation);
  if (opts.flip) ctx.scale(-1, 1);
  ctx.globalAlpha *= opts.alpha ?? 1;
  ctx.drawImage(atlas, source.x, source.y, source.w, source.h, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return true;
}

function sourceRectFor(id: TerrainBrushId): SourceRect {
  const cell = BRUSHES[id];
  const cellW = atlas.naturalWidth / COLS;
  const cellH = atlas.naturalHeight / ROWS;
  return { x: cell.col * cellW, y: cell.row * cellH, w: cellW, h: cellH };
}

function buildTrimmedRects(): Partial<Record<TerrainBrushId, SourceRect>> {
  const canvas = document.createElement('canvas');
  canvas.width = atlas.naturalWidth;
  canvas.height = atlas.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return {};
  ctx.drawImage(atlas, 0, 0);
  const out: Partial<Record<TerrainBrushId, SourceRect>> = {};
  for (const id of Object.keys(BRUSHES) as TerrainBrushId[]) {
    const cell = sourceRectFor(id);
    const x0 = Math.floor(cell.x);
    const y0 = Math.floor(cell.y);
    const x1 = Math.ceil(cell.x + cell.w);
    const y1 = Math.ceil(cell.y + cell.h);
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let minX = x1, minY = y1, maxX = x0, maxY = y0;
    for (let y = 0; y < y1 - y0; y++) {
      for (let x = 0; x < x1 - x0; x++) {
        const alpha = data[(y * (x1 - x0) + x) * 4 + 3];
        if (alpha <= ALPHA_TRIM_THRESHOLD) continue;
        minX = Math.min(minX, x0 + x);
        minY = Math.min(minY, y0 + y);
        maxX = Math.max(maxX, x0 + x);
        maxY = Math.max(maxY, y0 + y);
      }
    }
    if (maxX < minX || maxY < minY) {
      out[id] = cell;
      continue;
    }
    const pad = 4;
    out[id] = {
      x: Math.max(x0, minX - pad),
      y: Math.max(y0, minY - pad),
      w: Math.min(x1, maxX + pad) - Math.max(x0, minX - pad),
      h: Math.min(y1, maxY + pad) - Math.max(y0, minY - pad),
    };
  }
  return out;
}
