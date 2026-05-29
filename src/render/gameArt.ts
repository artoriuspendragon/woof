import type { ResourceType, Species } from '../sim/types';

export type SpriteId =
  | 'army-dog' | 'army-cat' | 'army-fox' | 'army-mole' | 'army-badger' | 'army-neutral'
  | 'settlement-cottage' | 'settlement-village' | 'settlement-capital' | 'settlement-market' | 'settlement-watchtower' | 'settlement-harbor'
  | 'resource-food' | 'resource-wood' | 'resource-stone' | 'resource-iron' | 'resource-fish' | 'resource-bone'
  | 'resource-honey' | 'resource-berry' | 'resource-mushroom' | 'resource-catnip' | 'resource-shiny' | 'event-battle';

interface AtlasCell { col: number; row: number; }
interface SourceRect { x: number; y: number; w: number; h: number; }

const ATLAS_URL = new URL('assets/art/animal-revolution-atlas.png', document.baseURI).href;
const COLS = 6;
const ROWS = 4;
const ALPHA_TRIM_THRESHOLD = 16;

const SPRITES: Record<SpriteId, AtlasCell> = {
  'army-dog': { col: 0, row: 0 },
  'army-cat': { col: 1, row: 0 },
  'army-fox': { col: 2, row: 0 },
  'army-mole': { col: 3, row: 0 },
  'army-badger': { col: 4, row: 0 },
  'army-neutral': { col: 5, row: 0 },
  'settlement-cottage': { col: 0, row: 1 },
  'settlement-village': { col: 1, row: 1 },
  'settlement-capital': { col: 2, row: 1 },
  'settlement-market': { col: 3, row: 1 },
  'settlement-watchtower': { col: 4, row: 1 },
  'settlement-harbor': { col: 5, row: 1 },
  'resource-food': { col: 0, row: 2 },
  'resource-wood': { col: 1, row: 2 },
  'resource-stone': { col: 2, row: 2 },
  'resource-iron': { col: 3, row: 2 },
  'resource-fish': { col: 4, row: 2 },
  'resource-bone': { col: 5, row: 2 },
  'resource-honey': { col: 0, row: 3 },
  'resource-berry': { col: 1, row: 3 },
  'resource-mushroom': { col: 2, row: 3 },
  'resource-catnip': { col: 3, row: 3 },
  'resource-shiny': { col: 4, row: 3 },
  'event-battle': { col: 5, row: 3 },
};

export const SPECIES_SPRITES: Record<Species, SpriteId> = {
  dog: 'army-dog',
  cat: 'army-cat',
  fox: 'army-fox',
  mole: 'army-mole',
  badger: 'army-badger',
};

export const RESOURCE_SPRITES: Record<ResourceType, SpriteId> = {
  food: 'resource-food',
  wood: 'resource-wood',
  stone: 'resource-stone',
  iron: 'resource-iron',
  fish: 'resource-fish',
  bone: 'resource-bone',
  honey: 'resource-honey',
  berry: 'resource-berry',
  mushroom: 'resource-mushroom',
  catnip: 'resource-catnip',
  shiny: 'resource-shiny',
};

export const FX_SPRITES: Record<string, SpriteId> = {
  war: 'event-battle',
  celebrate: 'settlement-market',
  build: 'settlement-watchtower',
  good: 'resource-food',
  epic: 'resource-shiny',
  fall: 'army-neutral',
  select: 'resource-shiny',
};

const atlas = new Image();
let loaded = false;
let trims: Partial<Record<SpriteId, SourceRect>> = {};

atlas.onload = () => {
  loaded = true;
  trims = buildTrimmedRects();
};
atlas.src = ATLAS_URL;

export function isGameArtReady(): boolean {
  return loaded && atlas.naturalWidth > 0 && atlas.naturalHeight > 0;
}

export function drawArtSprite(
  ctx: CanvasRenderingContext2D,
  id: SpriteId,
  cx: number,
  cy: number,
  maxWidth: number,
  maxHeight = maxWidth,
  opts: { alpha?: number; shadow?: boolean; flip?: boolean } = {},
): boolean {
  if (!isGameArtReady()) return false;
  const source = trims[id] ?? sourceRectFor(id);
  if (source.w <= 0 || source.h <= 0) return false;

  const scale = Math.min(maxWidth / source.w, maxHeight / source.h);
  const dw = source.w * scale;
  const dh = source.h * scale;
  const dx = cx - dw / 2;
  const dy = cy - dh / 2;

  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  if (opts.shadow) {
    ctx.save();
    ctx.globalAlpha *= 0.22;
    ctx.fillStyle = '#2f2419';
    ctx.beginPath();
    ctx.ellipse(cx, cy + dh * 0.42, dw * 0.34, Math.max(1.6, dh * 0.075), -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (opts.flip) {
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(atlas, source.x, source.y, source.w, source.h, -dw / 2, dy, dw, dh);
  } else {
    ctx.drawImage(atlas, source.x, source.y, source.w, source.h, dx, dy, dw, dh);
  }
  ctx.restore();
  return true;
}

function sourceRectFor(id: SpriteId): SourceRect {
  const cell = SPRITES[id];
  const cellW = atlas.naturalWidth / COLS;
  const cellH = atlas.naturalHeight / ROWS;
  return { x: cell.col * cellW, y: cell.row * cellH, w: cellW, h: cellH };
}

function buildTrimmedRects(): Partial<Record<SpriteId, SourceRect>> {
  const canvas = document.createElement('canvas');
  canvas.width = atlas.naturalWidth;
  canvas.height = atlas.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return {};
  ctx.drawImage(atlas, 0, 0);
  const out: Partial<Record<SpriteId, SourceRect>> = {};
  for (const id of Object.keys(SPRITES) as SpriteId[]) {
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
