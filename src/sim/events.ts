import type { WorldState } from './types';
import { seasonOf } from './types';
import { emitLog } from './world';
import { aliveNations } from './util';
import { EVENT_DEFS, type EventCtx } from '../data/events';
import type { Rng } from './rng';

// 触发事件引擎（docs/01 §7 / docs/02 §6）
export function runEvents(world: WorldState, rng: Rng): void {
  const season = seasonOf(world.tick);
  for (const nation of aliveNations(world)) {
    const ctx: EventCtx = {
      world, nation, rng, season,
      emit: (level, text, tags) => emitLog(world, level, text, tags, nation.id, nation.capitalTile),
    };
    let fired = 0;
    for (const def of EVENT_DEFS) {
      if (fired >= 2) break;
      if (!def.check(nation, ctx)) continue;
      if (!rng.chance(def.probability)) continue;
      def.apply(nation, ctx);
      ctx.emit(def.level, def.text(nation, ctx), def.tags);
      fired++;
    }
  }
}
