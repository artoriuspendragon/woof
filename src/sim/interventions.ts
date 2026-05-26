import type { WorldState, NationId } from './types';
import { emitLog } from './world';
import { clamp } from './util';
import { makeRng } from './rng';
import { makeCharacter, addBio } from './people';

// 玩家轻度神明干预（GDD §13.2）。返回特效落点供渲染层。
export function harvestBless(world: WorldState, id: NationId): number | null {
  const n = world.nations[id];
  if (!n?.alive) return null;
  n.stats.food = clamp(n.stats.food + 60, 0, 400);
  n.stats.morale = clamp(n.stats.morale + 5, 0, 100);
  emitLog(world, 'major', `神明降下丰收祝福，${n.name}的田野金浪翻涌，粮仓充盈。`, ['intervention', 'good'], id, n.capitalTile);
  return n.capitalTile;
}

export function harmonyBless(world: WorldState, a: NationId, b: NationId): number | null {
  const na = world.nations[a], nb = world.nations[b];
  if (!na?.alive || !nb?.alive || a === b) return null;
  if (na.relations[b]) na.relations[b].value = clamp(na.relations[b].value + 28, -100, 100);
  if (nb.relations[a]) nb.relations[a].value = clamp(nb.relations[a].value + 28, -100, 100);
  na.atWar = na.atWar.filter((x) => x !== b);
  nb.atWar = nb.atWar.filter((x) => x !== a);
  emitLog(world, 'major', `风铃与花瓣飘过两都之间，${na.name}与${nb.name}的敌意悄然消融。`, ['intervention', 'good', 'diplomacy'], a, na.capitalTile);
  return na.capitalTile;
}

export function heroBorn(world: WorldState, id: NationId): number | null {
  const n = world.nations[id];
  if (!n?.alive) return null;
  n.stats.military = n.stats.military + 32;
  n.stats.morale = clamp(n.stats.morale + 10, 0, 100);
  n.stats.prestige = clamp(n.stats.prestige + 6, 0, 100);
  // 玩家干预产生的角色：用独立临时 rng 取名，不扰动主模拟流
  const rng = makeRng((world.seed ^ (world.tick * 2654435761) ^ world.charSeq) | 0);
  const hero = makeCharacter(world, rng, id, n.species, 'hero', '天命英雄');
  world.characters[hero.id] = hero;
  addBio(world, hero.id, `应神明流星而降生于${n.name}，天命所归。`);
  emitLog(world, 'major', `一颗流星坠入${n.name}，天命英雄${hero.name}就此降生，全军振奋。`, ['intervention', 'good', 'story'], id, n.capitalTile);
  return n.capitalTile;
}
