import type { WorldState, Nation } from '../types';
import { emitLog } from '../world';
import { eff, clamp, grudgeOf, aliveNations, totalStrength, borderingPairs, pairKey } from '../util';
import { nudge } from './ai';
import type { Rng } from '../rng';

// 战争外交层：求和判断 + 宣战判断。实际行军/野战/攻城/吞并由 armies.ts 处理。
export function war(world: WorldState, rng: Rng): void {
  // 0) 战争损耗：交战国持续折粮、磨损士气 —— 久战必衰，使战争自然收束
  for (const n of aliveNations(world)) {
    if (n.atWar.length === 0) continue;
    n.stats.food = Math.max(0, n.stats.food - 5);
    n.stats.morale = clamp(n.stats.morale - 1.2, 0, 100);
  }

  // 1) 求和：双方厌战→白和平；弱势方求和→割地停战；被彻底碾碎者不议和→交由军队攻灭(annex)
  const seen = new Set<string>();
  for (const a of aliveNations(world)) {
    for (const bid of [...a.atWar]) {
      const key = a.id < bid ? `${a.id}|${bid}` : `${bid}|${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const b = world.nations[bid];
      if (!b?.alive) { a.atWar = a.atWar.filter((x) => x !== bid); continue; }

      const sa = totalStrength(world, a.id), sb = totalStrength(world, b.id);
      const loser = sa < sb ? a : b, winner = sa < sb ? b : a;
      const ls = Math.min(sa, sb), ws = Math.max(sa, sb);

      if (a.stats.morale < 20 && b.stats.morale < 20) {
        makePeace(world, a, b, 'white');                       // 两败俱伤
      } else if (ls > 16 && ws > ls * 1.8 && loser.stats.morale < 35 && rng.chance(0.07)) {
        makePeace(world, winner, loser, 'cede');               // 弱势方求和割地
      }
      // ls <= 16：弱方已被碾碎，不议和，待军队攻陷其都城而亡国
    }
  }

  // 2) 宣战
  const ns = aliveNations(world);
  const borders = borderingPairs(world);
  for (let i = 0; i < ns.length; i++) {
    for (let j = 0; j < ns.length; j++) {
      if (i === j) continue;
      const a = ns[i], b = ns[j];
      if (a.atWar.includes(b.id)) continue;
      const r = a.relations[b.id];
      if (!r) continue;
      if (r.truceUntil && world.tick < r.truceUntil) continue;
      if (r.treaties.includes('alliance')) continue;
      if (!borders.has(pairKey(a.id, b.id)) && grudgeOf(a, b.id) < 30) continue;
      // 内忧外患者无力兴兵（复仇心切者例外）
      if ((a.stats.food < 30 || a.stats.stability < 42 || a.stats.morale < 38) && grudgeOf(a, b.id) < 40) continue;

      const ratio = totalStrength(world, a.id) / (totalStrength(world, b.id) + 1);
      const hostileBonus = r.value <= -40 ? 26 : r.value <= -10 ? 8 : -12;
      const desire =
        eff(world, a, 'aggression') * 0.5 +
        (ratio - 1) * 40 +
        grudgeOf(a, b.id) * 0.6 +
        hostileBonus +
        (a.stats.morale - 50) * 0.3 +
        eff(world, a, 'expansion') * 0.15;

      if (ratio > 1.05 && desire > 50 && rng.chance(Math.min(0.2, desire / 320))) {
        startWar(world, a, b, rng);
      }
    }
  }
}

function startWar(world: WorldState, a: Nation, b: Nation, rng: Rng): void {
  a.atWar.push(b.id); b.atWar.push(a.id);
  nudge(world, a.id, b.id, -30);
  a.relations[b.id].treaties = a.relations[b.id].treaties.filter((t) => t !== 'trade' && t !== 'alliance');
  b.relations[a.id].treaties = b.relations[a.id].treaties.filter((t) => t !== 'trade' && t !== 'alliance');
  const cb = casusBelli(a, b, rng);
  emitLog(world, 'major', `${a.name}以「${cb}」为由向${b.name}宣战，边境战云密布。`, ['war', 'declare'], a.id, b.capitalTile, [b.id]);
}

function casusBelli(a: Nation, b: Nation, rng: Rng): string {
  if (grudgeOf(a, b.id) > 30) return '夺回旧日失地';
  return rng.pick(['资源争夺', '边境摩擦', '商道之争', '宿怨难平', '王室声索']);
}

function makePeace(world: WorldState, x: Nation, y: Nation, kind: 'cede' | 'white'): void {
  x.atWar = x.atWar.filter((id) => id !== y.id);
  y.atWar = y.atWar.filter((id) => id !== x.id);
  const until = world.tick + 8;
  if (x.relations[y.id]) x.relations[y.id].truceUntil = until;
  if (y.relations[x.id]) y.relations[x.id].truceUntil = until;
  nudge(world, x.id, y.id, 12);
  if (kind === 'cede') {
    emitLog(world, 'major', `${x.name}与${y.name}停战议和，战事暂歇，边境恢复平静。`, ['war', 'peace'], x.id, x.capitalTile, [y.id]);
  } else {
    emitLog(world, 'major', `${x.name}与${y.name}打成白和平，双方精疲力竭，鸣金收兵。`, ['war', 'peace'], x.id, x.capitalTile, [y.id]);
  }
}
