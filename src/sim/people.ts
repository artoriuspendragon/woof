import type { WorldState, Character, CharRole, Species, NationId } from './types';
import type { Rng } from './rng';
import { SPECIES } from '../data/species';
import { FIGURE_NAMES } from '../data/names';

export const PERSONALITIES = [
  'kind', 'irritable', 'cunning', 'lazy', 'diligent',
  'vain', 'paranoid', 'warlike', 'conservative', 'gluttonous',
] as const;

export function nextCharId(world: WorldState): string {
  return `c${world.charSeq++}`;
}

function pickName(rng: Rng, species: Species, role: CharRole): string {
  const pool = role === 'king' ? SPECIES[species].rulerNames : FIGURE_NAMES[species];
  return rng.pick(pool);
}

// 创建一名角色（人物分布系统的基本单元，docs/01 §9）
export function makeCharacter(
  world: WorldState, rng: Rng, nation: NationId, species: Species, role: CharRole, title: string,
): Character {
  return {
    id: nextCharId(world),
    name: pickName(rng, species, role),
    nation, role, title,
    loyalty: Math.round(rng.range(40, 92)),
    ambition: Math.round(rng.range(20, 92)),
    ability: Math.round(rng.range(38, 94)),
    prestige: Math.round(rng.range(22, 66)),
    personality: rng.pick(PERSONALITIES),
    age: Math.round(rng.range(role === 'king' ? 28 : 22, 52)),
    bornTick: world.tick,
    alive: true,
    bio: [],
  };
}

export function addBio(world: WorldState, id: string | undefined, text: string): void {
  if (!id) return;
  const c = world.characters[id];
  if (c) c.bio.push({ tick: world.tick, text });
}

// 某国当前在世的名人（国王 / 将领 / 英雄）
export function notablePeople(world: WorldState, nation: NationId): Character[] {
  return Object.values(world.characters)
    .filter((c) => c.nation === nation && c.alive)
    .sort((a, b) => roleRank(a.role) - roleRank(b.role) || b.prestige - a.prestige);
}

function roleRank(r: CharRole): number {
  return r === 'king' ? 0 : r === 'general' ? 1 : 2;
}
