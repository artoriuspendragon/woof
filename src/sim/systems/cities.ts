import type { WorldState, Nation, TerrainType } from '../types';
import { emitLog, neighbors4 } from '../world';
import { TERRAIN } from '../../data/terrain';
import { aliveNations } from '../util';
import type { Rng } from '../rng';

// 不同地形作为城址的天然适宜度（平原沃土最佳，山雪沼泽次之）
const CITY_TERRAIN: Record<TerrainType, number> = {
  plain: 12, forest: 8, hill: 6, sand: 3, marsh: 2, mountain: 2, snow: 1, lake: 0, river: 0,
};

// 城市系统：参考地形、临水、与既有城市的距离、以及人口/稳定，自然地选址兴建并成长。
export function cities(world: WorldState, rng: Rng): void {
  const W = world.width;
  for (const n of aliveNations(world)) {
    if (n.stats.stability < 40) continue;            // 严重动荡之国无暇建城

    // 选址时与全部既有城市(含他国)保持距离 —— 否则两国边境会沿着海岸线扎堆建城
    const allCities: number[] = [];
    const ownCities: number[] = [];
    for (let i = 0; i < world.tiles.length; i++) {
      if (world.tiles[i].city > 0) {
        allCities.push(i);
        if (world.tiles[i].owner === n.id) ownCities.push(i);
      }
    }
    // 人口与疆域共同决定可供养的城市数
    const byPop = 1 + Math.floor((n.stats.population - 140) / 150);
    const maxCities = Math.max(1, Math.min(1 + Math.floor(n.territory / 11), byPop));

    // 兴建新城镇：在最宜居处择址（非随机）
    if (ownCities.length < maxCities && rng.chance(0.14)) {
      let best = -1, bestScore = -1;
      for (let i = 0; i < world.tiles.length; i++) {
        const t = world.tiles[i];
        if (t.owner !== n.id || t.city > 0 || t.dev < 35) continue;
        if (!TERRAIN[t.terrain].passable) continue;
        const dn = nearestCityDist(i, allCities, W);
        if (dn < 5) continue;                          // 与"任何"既有城市保持间距(全球)
        const score = CITY_TERRAIN[t.terrain]
          + t.dev * 0.35
          + waterBonus(world, i)                       // 临水加成（已下调）
          + Math.min(dn, 9) * 1.4                       // 提高分散权重
          + rng.next() * 4;
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0) {
        world.tiles[best].city = 1;
        ownCities.push(best);
        emitLog(world, 'medium', `${n.name}在水土丰饶处择址，兴建了一座${cityName(n)}。`, ['build', 'economy'], n.id, best);
      }
    }

    // 城镇成长（需人口与稳定支撑；首都恒为都城）
    for (const i of ownCities) {
      const t = world.tiles[i];
      if (i === n.capitalTile) { t.city = 3; continue; }
      if (t.city === 1 && n.stats.population > 420 && n.stats.stability > 55 && t.dev > 60 && rng.chance(0.04)) {
        t.city = 2;
        emitLog(world, 'minor', `${n.name}的城镇日渐繁荣，扩建为一座城市。`, ['build', 'economy'], n.id, i);
      }
    }
  }
}

function nearestCityDist(i: number, cities: number[], W: number): number {
  const x = i % W, y = (i / W) | 0;
  let min = Infinity;
  for (const c of cities) {
    const d = Math.abs(x - (c % W)) + Math.abs(y - ((c / W) | 0));
    if (d < min) min = d;
  }
  return min;
}

function waterBonus(world: WorldState, i: number): number {
  // 临水加成下调（原 +8 太强，会把所有城市吸到海岸线）
  for (const j of neighbors4(world, i)) {
    const tr = world.tiles[j].terrain;
    if (tr === 'river' || tr === 'lake') return 4;
  }
  return 0;
}

function cityName(n: Nation): string {
  return n.species === 'mole' ? '地下城镇' : '城镇';
}
