import type { WorldState } from './types';
import { makeRng } from './rng';
import { recomputeDerived } from './world';
import { economy } from './systems/economy';
import { characters } from './systems/characters';
import { ai } from './systems/ai';
import { cities } from './systems/cities';
import { diplomacy } from './systems/diplomacy';
import { war } from './systems/war';
import { armies } from './systems/armies';
import { runEvents } from './events';

// 模拟主循环：1 tick = 1 季节。严格固定顺序 = 确定性（docs/01 §2、docs/02 §3）。
export function tick(world: WorldState): void {
  const rng = makeRng(world.rngState); // 从存档状态恢复，继续确定性序列

  economy(world, rng);     // 1-4 资源/消耗/人口/军力
  characters(world, rng);  // 5   角色：老去、继承、列传
  ai(world, rng);          // 6   内政 + 和平主动行动（含扩张）
  cities(world, rng);      // 6.5 城市兴建与成长
  diplomacy(world, rng);   // 7   外交关系漂移 / 结盟 / 仇恨衰减
  war(world, rng);         // 8   宣战 / 求和判断
  armies(world, rng);      // 8.5 军队：征召 / 行军 / 野战 / 占领 / 攻城 / 分兵 / 班师
  runEvents(world, rng);   // 9   触发事件 → 日志

  recomputeDerived(world); // 10  重建缓存
  world.tick++;            // 11
  world.rngState = rng.state;
}
