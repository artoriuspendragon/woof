import {
  type WorldState, type Tile, type Nation,
  type TerrainType, type ResourceType, type Species, type LogLevel,
  type Relation, type RelationStatus, type NationId,
} from './types';
import { makeRng, type Rng } from './rng';
import { TERRAIN } from '../data/terrain';
import { RESOURCE, RESOURCE_TYPES } from '../data/resources';
import { SPECIES, SPECIES_ORDER } from '../data/species';
import { naturalRelation } from '../data/relations';
import { makeCharacter, addBio } from './people';

const WORLD_VERSION = 1;
// 适当紧凑：5 国在此密度下会较快接壤、互动、开战（过大的世界会让各国老死不相往来）
export const DEFAULT_W = 84;
export const DEFAULT_H = 54;

// ---------- 值噪声（确定性，按 seed） ----------
function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 362437)) | 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const v00 = hash2(x0, y0, seed), v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed), v11 = hash2(x0 + 1, y0 + 1, seed);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}
function fractal(x: number, y: number, seed: number, octaves: number, freq: number): number {
  let amp = 1, sum = 0, norm = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x * f, y * f, seed + o * 1013);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

// ---------- 几何辅助 ----------
export function neighbors4(w: WorldState, i: number): number[] {
  const x = i % w.width, y = (i / w.width) | 0;
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < w.width - 1) out.push(i + 1);
  if (y > 0) out.push(i - w.width);
  if (y < w.height - 1) out.push(i + w.width);
  return out;
}

export function emitLog(w: WorldState, level: LogLevel, text: string, tags: string[], nation?: NationId, tile?: number, otherNations?: NationId[]): void {
  w.log.push({
    id: w.logSeq++, tick: w.tick, level, text, tags,
    ...(nation ? { nation } : {}),
    ...(tile !== undefined ? { tile } : {}),
    ...(otherNations && otherNations.length ? { otherNations } : {}),
  });
  if (w.log.length > 600) w.log.splice(0, w.log.length - 600); // 防无限增长
}

// ---------- 派生缓存重算 ----------
export function statusFromRelation(r: Relation, nemesis: boolean): RelationStatus {
  if (r.treaties.includes('alliance')) return 'allied';
  if (nemesis || r.value <= -75) return 'nemesis';
  if (r.value <= -40) return 'hostile';
  if (r.value < 0) return 'tense';
  if (r.value >= 60) return 'friendly';
  return 'neutral';
}

export function recomputeDerived(w: WorldState): void {
  for (const n of Object.values(w.nations)) n.territory = 0;
  for (const t of w.tiles) if (t.owner && w.nations[t.owner]?.alive) w.nations[t.owner].territory++;
  for (const n of Object.values(w.nations)) {
    for (const [other, r] of Object.entries(n.relations)) {
      const nemesis = n.memory.some((g) => g.against === other && g.intensity > 40);
      r.status = statusFromRelation(r, nemesis);
    }
  }
}

// ---------- 世界生成 ----------
export function createWorld(seed: number, width = DEFAULT_W, height = DEFAULT_H): WorldState {
  const rng = makeRng(seed);
  const elevSeed = (seed ^ 0x9e3779b9) | 0;
  const moistSeed = (seed ^ 0x85ebca6b) | 0;

  const tiles: Tile[] = new Array(width * height);
  const elev = new Float32Array(width * height);

  const cx = width / 2, cy = height / 2;
  const maxR = Math.hypot(cx, cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let e = fractal(x, y, elevSeed, 5, 0.06);
      // 轻度海岛衰减：仅边缘降高，保持中央大陆连成一片（各国才能接壤交战）
      const d = Math.hypot(x - cx, y - cy) / maxR;
      e = e * (1.12 - d * 0.32);
      elev[i] = e;
      const m = fractal(x, y, moistSeed, 4, 0.05);
      tiles[i] = { terrain: classify(e, m), resource: null, owner: null, dev: 10, tint: hash2(x, y, seed + 7), city: 0 };
    }
  }

  carveRivers(tiles, elev, width, height, rng);
  scatterResources(tiles, width, height, rng);

  const world: WorldState = {
    version: WORLD_VERSION, seed, rngState: rng.state, tick: 0,
    width, height, tiles, nations: {}, characters: {}, log: [], logSeq: 1, charSeq: 1,
    armies: {}, armySeq: 1, sieges: {},
  };

  placeNations(world, rng);
  recomputeDerived(world);
  world.rngState = rng.state;
  emitLog(world, 'epic', '世界初成，五个动物文明在大陆上立国，故事就此展开。', ['epic', 'origin']);
  return world;
}

function classify(e: number, m: number): TerrainType {
  if (e < 0.26) return 'lake';                          // 降低海平面 → 减少内海/把大陆连成片
  if (e < 0.31) return m > 0.55 ? 'marsh' : 'sand';
  if (e < 0.60) return m > 0.56 ? 'forest' : 'plain';
  if (e < 0.74) return 'hill';
  if (e < 0.87) return 'mountain';
  return 'snow';
}

function carveRivers(tiles: Tile[], elev: Float32Array, w: number, h: number, rng: Rng): void {
  const rivers = 5;
  for (let r = 0; r < rivers; r++) {
    let x = rng.int(w), y = rng.int(h);
    let i = y * w + x;
    if (elev[i] < 0.6) { r--; continue; }
    for (let step = 0; step < 200; step++) {
      const t = tiles[i];
      if (t.terrain === 'lake' || t.terrain === 'river') break;
      if (t.terrain !== 'snow' && t.terrain !== 'mountain') t.terrain = 'river';
      // 走向最低邻居
      let best = -1, bestE = elev[i];
      const nx = [x - 1, x + 1, x, x], ny = [y, y, y - 1, y + 1];
      for (let k = 0; k < 4; k++) {
        const px = nx[k], py = ny[k];
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const j = py * w + px;
        if (elev[j] < bestE) { bestE = elev[j]; best = j; x = px; y = py; }
      }
      if (best < 0) break;
      i = best;
    }
  }
}

function scatterResources(tiles: Tile[], w: number, h: number, rng: Rng): void {
  for (let i = 0; i < w * h; i++) {
    const t = tiles[i];
    if (!TERRAIN[t.terrain].passable) continue;
    if (!rng.chance(0.05)) continue;
    const candidates = RESOURCE_TYPES.filter((rt) => RESOURCE[rt].spawnOn.includes(t.terrain));
    if (candidates.length === 0) continue;
    t.resource = rng.pick(candidates);
  }
}

function placeNations(world: WorldState, rng: Rng): void {
  const { width, tiles } = world;
  // 候选：可居住且产出尚可的陆地
  const land: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (TERRAIN[t.terrain].passable && t.terrain !== 'sand' && t.terrain !== 'snow') land.push(i);
  }
  const px = (i: number) => i % width, py = (i: number) => (i / width) | 0;

  const chosen: number[] = [];
  chosen.push(rng.pick(land));
  while (chosen.length < SPECIES_ORDER.length) {
    let bestTile = -1, bestDist = -1;
    // 取一批随机候选，挑距已选最远者（确定性 + 分散）
    for (let s = 0; s < 220; s++) {
      const cand = rng.pick(land);
      let md = Infinity;
      for (const c of chosen) md = Math.min(md, Math.hypot(px(cand) - px(c), py(cand) - py(c)));
      if (md > bestDist) { bestDist = md; bestTile = cand; }
    }
    chosen.push(bestTile);
  }

  SPECIES_ORDER.forEach((species, k) => {
    const cap = chosen[k];
    const id: NationId = `${species}_1`;
    const def = SPECIES[species];

    const king = makeCharacter(world, rng, id, species, 'king', '开国之君');
    const general = makeCharacter(world, rng, id, species, 'general', '开国大将');
    world.characters[king.id] = king;
    world.characters[general.id] = general;
    addBio(world, king.id, `在${def.capitalNames[0]}加冕，开创${def.name}。`);
    addBio(world, general.id, `追随${king.name}立国，受封为${def.name}大将。`);

    const nation: Nation = {
      id, name: def.name, species, color: def.color,
      capitalTile: cap, rulerId: king.id, generalId: general.id,
      traits: driftTraits(def.baseTraits, rng),
      stats: {
        population: Math.round(rng.range(180, 300)),
        food: 90, military: Math.round(rng.range(60, 110)),
        stability: Math.round(rng.range(55, 80)),
        morale: Math.round(rng.range(55, 80)),
        wealth: Math.round(rng.range(40, 70)),
        culture: Math.round(rng.range(35, 60)),
        prestige: Math.round(rng.range(25, 45)),
      },
      territory: 0, relations: {}, goals: ['develop'], memory: [],
      atWar: [], alive: true, fortify: 0,
    };
    world.nations[id] = nation;
    claimAround(world, cap, id, 2);
    world.tiles[cap].city = 3; // 都城
  });

  // 关系初始化
  const ids = Object.keys(world.nations);
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const base = naturalRelation(world.nations[a].species, world.nations[b].species);
      const v = Math.max(-100, Math.min(100, base + Math.round(rng.range(-6, 6))));
      world.nations[a].relations[b] = { value: v, status: 'neutral', treaties: [] };
    }
  }
}

function driftTraits(base: Nation['traits'], rng: Rng): Nation['traits'] {
  const out = {} as Nation['traits'];
  (Object.keys(base) as Array<keyof Nation['traits']>).forEach((k) => {
    out[k] = Math.max(0, Math.min(100, Math.round(base[k] + rng.range(-6, 6))));
  });
  return out;
}

function claimAround(world: WorldState, center: number, owner: NationId, radius: number): void {
  const { width, height, tiles } = world;
  const cxp = center % width, cyp = (center / width) | 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cxp + dx, y = cyp + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (Math.abs(dx) + Math.abs(dy) > radius + 1) continue;
      const i = y * width + x;
      if (TERRAIN[tiles[i].terrain].passable && tiles[i].owner === null) {
        tiles[i].owner = owner;
        tiles[i].dev = 20;
      }
    }
  }
  tiles[center].owner = owner;
  tiles[center].dev = 45;
}

// resource 是否被某国偏好（产出加成）
export function resourcePreferred(species: Species, r: ResourceType | null): boolean {
  return r !== null && SPECIES[species].preferredResources.includes(r);
}
