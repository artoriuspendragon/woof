import type { WorldState, Nation, AiTraits, Personality, NationId, Army } from './types';
import { neighbors4 } from './world';
import { TERRAIN } from '../data/terrain';

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// 性格对倾向的调整（GDD §9.4）
const PERSONALITY_MOD: Record<Personality, Partial<AiTraits>> = {
  kind:         { aggression: -10, stability: 6 },
  irritable:    { aggression: 12, stability: -6 },
  cunning:      { intrigue: 15, trade: 8 },
  lazy:         { engineering: -10, expansion: -8 },
  diligent:     { engineering: 12, expansion: 4 },
  vain:         { trade: 6, tradition: 4 },
  paranoid:     { intrigue: 8, aggression: 5, stability: -5 },
  warlike:      { aggression: 16, expansion: 8 },
  conservative: { expansion: -10, tradition: 10, stability: 5 },
  gluttonous:   { trade: 4 },
};

export function eff(world: WorldState, n: Nation, trait: keyof AiTraits): number {
  const ruler = world.characters[n.rulerId];
  let v = n.traits[trait];
  if (ruler?.alive) v += PERSONALITY_MOD[ruler.personality][trait] ?? 0;
  return clamp(v, 0, 100);
}

export function grudgeOf(n: Nation, against: NationId): number {
  let g = 0;
  for (const m of n.memory) if (m.against === against) g += m.intensity;
  return g;
}

// defender 拥有、且与 attacker 接壤的 tile（前线）
export function enemyBorderTiles(world: WorldState, attacker: NationId, defender: NationId): number[] {
  const out: number[] = [];
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i].owner !== defender) continue;
    if (neighbors4(world, i).some((j) => world.tiles[j].owner === attacker)) out.push(i);
  }
  return out;
}

export function sharesBorder(world: WorldState, a: NationId, b: NationId): boolean {
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i].owner !== a) continue;
    if (neighbors4(world, i).some((j) => world.tiles[j].owner === b)) return true;
  }
  return false;
}

// 某国领土外缘、可占领的无主陆地 tile
export function frontierTiles(world: WorldState, id: NationId): number[] {
  const seen = new Set<number>();
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i].owner !== id) continue;
    for (const j of neighbors4(world, i)) {
      const t = world.tiles[j];
      if (t.owner === null && TERRAIN[t.terrain].passable) seen.add(j);
    }
  }
  return [...seen];
}

export const aliveNations = (world: WorldState): Nation[] =>
  Object.values(world.nations).filter((n) => n.alive).sort((a, b) => (a.id < b.id ? -1 : 1));

// 军队按数值序号确定性排序
export const sortedArmies = (world: WorldState): Army[] =>
  Object.values(world.armies).sort((a, b) => a.seq - b.seq);

// 总军力 = 本土后备 + 在外军队兵力（用于宣战/求和判断）
export function totalStrength(world: WorldState, id: NationId): number {
  let s = world.nations[id]?.stats.military ?? 0;
  for (const a of Object.values(world.armies)) if (a.nation === id) s += a.size;
  return s;
}

export function pushGrudge(loser: Nation, against: NationId, tick: number): void {
  const g = loser.memory.find((m) => m.against === against);
  if (g) g.intensity = clamp(g.intensity + 8, 0, 100);
  else loser.memory.push({ against, intensity: 18, sinceTick: tick });
}

export const pairKey = (a: NationId, b: NationId): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

// 一次 O(tiles) 扫描得出所有"接壤的国家对"（供外交摩擦与宣战判断共用，避免重复扫图）
export function borderingPairs(world: WorldState): Set<string> {
  const set = new Set<string>();
  const W = world.width, N = world.tiles.length;
  for (let i = 0; i < N; i++) {
    const o = world.tiles[i].owner;
    if (!o || !world.nations[o]?.alive) continue;
    if (i % W < W - 1) { const r = world.tiles[i + 1].owner; if (r && r !== o && world.nations[r]?.alive) set.add(pairKey(o, r)); }
    if (i + W < N) { const d = world.tiles[i + W].owner; if (d && d !== o && world.nations[d]?.alive) set.add(pairKey(o, d)); }
  }
  return set;
}
