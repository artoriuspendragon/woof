import type { WorldState } from '../types';
import { seasonOf } from '../types';
import { emitLog, resourcePreferred } from '../world';
import { TERRAIN, seasonFoodMul } from '../../data/terrain';
import { RESOURCE } from '../../data/resources';
import { SPECIES } from '../../data/species';
import { clamp, aliveNations } from '../util';
import { addBio } from '../people';
import type { Rng } from '../rng';

// 资源生产 → 消耗 → 人口 → 军力（docs/01 §3）
export function economy(world: WorldState, rng: Rng): void {
  const season = seasonOf(world.tick);
  const prod: Record<string, { food: number; gold: number; mil: number }> = {};
  for (const n of aliveNations(world)) prod[n.id] = { food: 0, gold: 0, mil: 0 };

  for (let i = 0; i < world.tiles.length; i++) {
    const t = world.tiles[i];
    if (!t.owner) continue;
    const n = world.nations[t.owner];
    if (!n?.alive) continue;
    const td = TERRAIN[t.terrain];
    const devMul = 0.5 + (t.dev / 100) * 0.5;
    let food = td.yield.food * seasonFoodMul(season);
    let gold = td.yield.gold;
    let mil = 0;
    if (t.resource) {
      const rd = RESOURCE[t.resource];
      food += rd.yield.food; gold += rd.yield.gold; mil += rd.yield.military;
      if (resourcePreferred(n.species, t.resource)) { food *= 1.25; gold *= 1.25; }
    }
    const p = prod[n.id];
    p.food += food * devMul;
    p.gold += gold * devMul;
    p.mil += mil;
  }

  for (const n of aliveNations(world)) {
    const mvp = SPECIES[n.species].mvp;
    const p = prod[n.id];
    const producedFood = p.food * mvp.food;
    const need = n.stats.population * 0.03 + n.stats.military * 0.015;
    const balance = producedFood - need;
    n.stats.food = clamp(n.stats.food + balance, 0, 400);

    // 承载力（logistic）：以本季产出折算可养人口的 ~42%，留出冬季缓冲，防止人口失控→年年饥荒
    const capacity = (producedFood / 0.03) * 0.42;
    if (balance < 0) {
      const loss = Math.min(n.stats.population * 0.07, -balance * 4 + 2);
      n.stats.population -= loss;
      n.stats.stability = clamp(n.stats.stability - 3, 0, 100);
      n.stats.morale = clamp(n.stats.morale - 4, 0, 100);
      if (loss > n.stats.population * 0.04 && rng.chance(0.5)) {
        emitLog(world, 'major', logFamine(world, n.name), ['internal', 'famine'], n.id, n.capitalTile);
      }
    } else if (n.stats.population < capacity) {
      const growth = n.stats.population * 0.022 * (0.5 + n.stats.stability / 200) * (1 - n.stats.population / Math.max(capacity, 1));
      n.stats.population += growth;
    }
    n.stats.population = Math.max(0, n.stats.population);
    if (n.stats.population < 12) { killNation(world, n.id, '人口凋零，国祚终结'); continue; }

    // 财富（0..100 指数）：随金币收入升、随军队维护降
    n.stats.wealth = clamp(n.stats.wealth + p.gold * 0.06 - 0.4, 0, 100);

    // 军力趋向目标（受人口 / 铁产 / 财富约束）
    const target = (n.stats.population * 0.26 + p.mil * 2) * (n.stats.wealth > 25 ? 1 : 0.6);
    n.stats.military += (target - n.stats.military) * 0.15 * mvp.military;
    n.stats.military = Math.max(0, n.stats.military);

    // 稳定/民心向 60 回归（和平年代恢复要快于战乱/饥荒的冲击，避免被永久压低）
    n.stats.stability = clamp(n.stats.stability + (60 - n.stats.stability) * 0.045 * mvp.stability, 0, 100);
    n.stats.morale = clamp(n.stats.morale + (58 - n.stats.morale) * 0.035 + (n.stats.wealth > 50 ? 0.4 : -0.3), 0, 100);
    n.stats.culture = clamp(n.stats.culture + (40 - n.stats.culture) * 0.01, 0, 100);
    n.stats.prestige = clamp(n.stats.prestige + (35 - n.stats.prestige) * 0.01, 0, 100);
  }
}

function logFamine(world: WorldState, name: string): string {
  void world;
  return `饥荒袭来，${name}粮仓见底，人口锐减，民心动荡。`;
}

export function killNation(world: WorldState, id: string, reason: string): void {
  const n = world.nations[id];
  if (!n || !n.alive) return;
  n.alive = false;
  for (let i = 0; i < world.tiles.length; i++) if (world.tiles[i].owner === id) world.tiles[i].owner = null;
  for (const other of Object.values(world.nations)) {
    other.atWar = other.atWar.filter((x) => x !== id);
  }
  for (const cid of [n.rulerId, n.generalId]) {
    const c = world.characters[cid];
    if (c?.alive) { c.alive = false; c.deathTick = world.tick; addBio(world, cid, `${n.name}覆灭，与故国一同消逝。`); }
  }
  emitLog(world, 'epic', `${n.name}覆灭——${reason}。一个文明就此写入史册。`, ['epic', 'fall'], id, n.capitalTile);
}
