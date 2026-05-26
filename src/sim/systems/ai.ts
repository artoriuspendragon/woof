import type { WorldState, Nation, GoalKind, NationId } from '../types';
import { neighbors4, emitLog } from '../world';
import { TERRAIN } from '../../data/terrain';
import { eff, clamp, frontierTiles, aliveNations } from '../util';
import type { Rng } from '../rng';

// 国家 AI：每 tick 选 1 个和平主动行动并执行（docs/01 §4）。战争决策见 war.ts。
export function ai(world: WorldState, rng: Rng): void {
  for (const n of aliveNations(world)) {
    const jitter = () => 0.85 + rng.next() * 0.3;
    const frontier = frontierTiles(world, n.id);

    const scores: Record<GoalKind, number> = {
      develop: (35 + eff(world, n, 'engineering') * 0.3) * jitter(),
      // 只要还有相邻无主地就优先开拓 —— 各国据此填满大陆、彼此接壤，从而产生摩擦与战争
      expand: (frontier.length > 0 ? 50 + eff(world, n, 'expansion') * 0.5 + (n.stats.food > 50 ? 12 : 0) : 0) * jitter(),
      fortify: (eff(world, n, 'engineering') * 0.18 + eff(world, n, 'tradition') * 0.12 + (n.atWar.length ? 25 : 0)) * jitter(),
      trade: (eff(world, n, 'trade') * 0.4 * (hasTradePartner(world, n) ? 1 : 0)) * jitter(),
      festival: (n.species === 'cat' ? 25 : 0) + eff(world, n, 'trade') * 0.1 * jitter(),
      intrigue: (eff(world, n, 'intrigue') * 0.25 * (n.stats.military < 90 ? 1 : 0.4)) * jitter(),
      survive: n.stats.food < 20 ? 999 : 0,
      war: 0,
    };

    let best: GoalKind = 'develop';
    for (const k of Object.keys(scores) as GoalKind[]) if (scores[k] > scores[best]) best = k;
    n.goals = [best];

    switch (best) {
      case 'survive':
      case 'develop': develop(world, n); break;
      case 'expand': expand(world, n, frontier, rng); break;
      case 'fortify': n.fortify = clamp(n.fortify + 4, 0, 60); break;
      case 'trade': doTrade(world, n, rng); break;
      case 'festival': n.stats.culture = clamp(n.stats.culture + 3, 0, 100); n.stats.morale = clamp(n.stats.morale + 2, 0, 100); break;
      case 'intrigue': doIntrigue(world, n, rng); break;
      default: develop(world, n);
    }
  }
}

function develop(world: WorldState, n: Nation): void {
  // 提升若干块低开发度领土
  let raised = 0;
  for (let i = 0; i < world.tiles.length && raised < 6; i++) {
    const t = world.tiles[i];
    if (t.owner === n.id && t.dev < 100) { t.dev = clamp(t.dev + 6, 0, 100); raised++; }
  }
}

// 自然扩张：每 tick 选一个"突进点"作种子，从它向四周连续吞并，长成团块/箭头形，
// 而非沿行扫描成一条直线。地块评分偏好被己方包围(填凹)、肥沃、靠近本土。
function expand(world: WorldState, n: Nation, frontier: number[], rng: Rng): void {
  if (frontier.length === 0) return;
  const W = world.width;
  const budget = 1 + Math.floor(eff(world, n, 'expansion') / 28);
  const capX = n.capitalTile % W, capY = (n.capitalTile / W) | 0;

  const score = (i: number): number => {
    let own = 0;
    for (const j of neighbors4(world, i)) if (world.tiles[j].owner === n.id) own++;
    const td = TERRAIN[world.tiles[i].terrain];
    const yieldScore = td.yield.food * 1.5 + td.yield.gold + td.yield.stone * 0.5;
    const dx = (i % W) - capX, dy = ((i / W) | 0) - capY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return own * 6 + yieldScore + rng.next() * 9 - dist * 0.12;
  };

  // 选种子
  let seed = frontier[0], best = -Infinity;
  for (const i of frontier) { const s = score(i); if (s > best) { best = s; seed = i; } }

  // 从种子向相邻无主地连续蔓延，直到用尽本回合扩张额度
  const candidates = [seed];
  const inList = new Set<number>([seed]);
  let claimed = 0;
  while (claimed < budget && candidates.length > 0) {
    let bi = 0, bs = -Infinity;
    for (let k = 0; k < candidates.length; k++) { const s = score(candidates[k]); if (s > bs) { bs = s; bi = k; } }
    const i = candidates.splice(bi, 1)[0];
    if (world.tiles[i].owner !== null || !TERRAIN[world.tiles[i].terrain].passable) continue;
    world.tiles[i].owner = n.id;
    world.tiles[i].dev = 12;
    claimed++;
    for (const j of neighbors4(world, i)) {
      const o = world.tiles[j].owner;
      if (o && o !== n.id && world.nations[o]?.alive) {
        nudge(world, n.id, o, -1.8);
        if (rng.chance(0.03)) {
          emitLog(world, 'medium', `${n.name}的拓荒队推进到${world.nations[o].name}边境，巡逻队互相戒备。`, ['diplomacy', 'border'], n.id, i);
        }
      } else if (o === null && TERRAIN[world.tiles[j].terrain].passable && !inList.has(j)) {
        candidates.push(j); inList.add(j);   // 向邻近无主地继续吃
      }
    }
  }
}

function hasTradePartner(world: WorldState, n: Nation): boolean {
  return Object.entries(n.relations).some(([id, r]) =>
    world.nations[id]?.alive && r.value >= 0 && !r.treaties.includes('trade') && !n.atWar.includes(id));
}

function doTrade(world: WorldState, n: Nation, rng: Rng): void {
  const partners = Object.entries(n.relations)
    .filter(([id, r]) => world.nations[id]?.alive && r.value >= 0 && !r.treaties.includes('trade') && !n.atWar.includes(id))
    .sort((a, b) => b[1].value - a[1].value);
  if (partners.length === 0) return;
  const [pid] = partners[0];
  if (!rng.chance(0.5)) return;
  n.relations[pid].treaties.push('trade');
  world.nations[pid].relations[n.id].treaties.push('trade');
  nudge(world, n.id, pid, 6);
  n.stats.wealth = clamp(n.stats.wealth + 4, 0, 100);
  world.nations[pid].stats.wealth = clamp(world.nations[pid].stats.wealth + 4, 0, 100);
  emitLog(world, 'medium', `${n.name}与${world.nations[pid].name}签订了贸易协定，双方商路繁荣。`, ['diplomacy', 'trade'], n.id, n.capitalTile);
}

function doIntrigue(world: WorldState, n: Nation, rng: Rng): void {
  // 扶持目标内部不稳（狐狸国味道）
  const targets = aliveNations(world).filter((m) => m.id !== n.id && (n.relations[m.id]?.value ?? 0) < 20);
  if (targets.length === 0) return;
  const target = rng.pick(targets);
  target.stats.stability = clamp(target.stats.stability - 3, 0, 100);
  if (rng.chance(0.18)) {
    // 阴谋暴露
    nudge(world, n.id, target.id, -12);
    emitLog(world, 'major', `${target.name}查获${n.name}派来的密探，朝野哗然，两国关系骤冷。`, ['intrigue', 'diplomacy'], target.id, target.capitalTile);
  } else if (rng.chance(0.1)) {
    emitLog(world, 'minor', `${n.name}的暗探在${target.name}悄悄活动，民间流言四起。`, ['intrigue'], n.id, target.capitalTile);
  }
}

export function nudge(world: WorldState, a: NationId, b: NationId, delta: number): void {
  const ra = world.nations[a]?.relations[b];
  const rb = world.nations[b]?.relations[a];
  if (ra) ra.value = clamp(ra.value + delta, -100, 100);
  if (rb) rb.value = clamp(rb.value + delta, -100, 100);
}
