import type { WorldState } from '../types';
import { emitLog } from '../world';
import { naturalRelation } from '../../data/relations';
import { eff, aliveNations, borderingPairs, pairKey } from '../util';
import type { Rng } from '../rng';

// 关系演化 + 结盟 + 仇恨衰减（docs/01 §5）
export function diplomacy(world: WorldState, rng: Rng): void {
  const ns = aliveNations(world);
  const borders = borderingPairs(world);

  for (let i = 0; i < ns.length; i++) {
    for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i], b = ns[j];
      const rab = a.relations[b.id], rba = b.relations[a.id];
      if (!rab || !rba) continue;
      if (a.atWar.includes(b.id)) continue;             // 交战中由 war.ts 主导

      const allied = rab.treaties.includes('alliance');
      const truce = rab.truceUntil !== undefined && world.tick < rab.truceUntil;

      if (borders.has(pairKey(a.id, b.id)) && !allied && !truce) {
        // 接壤即生摩擦：领土相邻的国家关系持续走低 → 邻国终将兵戎相见
        const v = Math.max(-100, rab.value - 0.45);
        rab.value = v; rba.value = v;
      } else {
        // 不接壤 / 停战期 / 同盟：向自然基线回归（远交，伤口愈合）
        const base = naturalRelation(a.species, b.species);
        const v = Math.max(-100, Math.min(100, rab.value + Math.sign(base - rab.value) * 0.5));
        rab.value = v; rba.value = v;
      }

      // 结盟：双方友好、有共同敌人，尚未结盟
      const shareEnemy = a.atWar.some((e) => b.atWar.includes(e));
      if (rab.value > 50 && !allied && (shareEnemy || rng.chance(0.01))) {
        rab.treaties.push('alliance'); rba.treaties.push('alliance');
        emitLog(world, 'major', `${a.name}与${b.name}缔结军事同盟，山海为誓。`, ['diplomacy', 'alliance'], a.id, a.capitalTile, [b.id]);
      }
    }
  }

  // 仇恨随时间衰减（獾国复仇心高 → 衰减慢，复仇火种不熄）
  for (const n of ns) {
    const decay = 0.15 * (1 - eff(world, n, 'revenge') / 200);
    for (const g of n.memory) g.intensity -= decay;
    n.memory = n.memory.filter((g) => g.intensity > 1 && world.nations[g.against]?.alive);
  }
}
