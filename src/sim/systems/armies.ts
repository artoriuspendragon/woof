import type { WorldState, Nation, Army, Character } from '../types';
import { neighbors4, emitLog } from '../world';
import { TERRAIN } from '../../data/terrain';
import { SPECIES } from '../../data/species';
import { clamp, aliveNations, sortedArmies, totalStrength, pushGrudge } from '../util';
import { makeCharacter, addBio } from '../people';
import type { Rng } from '../rng';

// 军队系统：将领/英雄统兵，在地图上行军、野战、攻城；可分兵、转移战线。
// 征服由军队所在位置向外蔓延，而非按行扫描 —— 因此战线呈自然箭头推进。
export function armies(world: WorldState, rng: Rng): void {
  // 清除已亡国的残军
  for (const id of Object.keys(world.armies)) {
    if (!world.nations[world.armies[id].nation]?.alive) delete world.armies[id];
  }

  // 征召与分兵
  const leading = new Set(Object.values(world.armies).map((a) => a.leaderId));
  for (const n of aliveNations(world)) {
    if (n.atWar.length === 0) continue;
    const own = sortedArmies(world).filter((a) => a.nation === n.id);
    if (own.length === 0) {
      if (n.stats.military > 20) raiseArmy(world, n, n.atWar[0], rng);
      continue;
    }
    if (own.length >= 3) continue;                         // 最多 3 支
    // 分兵：主力雄厚 + 有值得另开的战线（多线作战，或敌方有远离主力的领土）
    const big = own.find((a) => a.size > 85);
    if (big && wantsSecondColumn(world, n, big) && rng.chance(0.13)) {
      const hero = freeHero(world, n.id, leading);
      const leader = hero ?? newSubCommander(world, rng, n);  // 优先英雄，否则擢升偏将
      leading.add(leader.id);
      let focus: string | undefined;
      if (n.atWar.length >= 2) {
        const primary = nearestEnemyNation(world, big);
        if (primary) big.focusEnemy = primary;
        focus = n.atWar.find((e) => e !== primary);
      }
      splitArmy(world, big, leader, focus);
    }
  }

  // 逐军行动（确定性顺序；当回合已交战者不再重复）
  const fought = new Set<string>();
  for (const army of sortedArmies(world)) {
    if (!world.armies[army.id] || fought.has(army.id)) continue;
    const n = world.nations[army.nation];
    if (!n?.alive) { delete world.armies[army.id]; continue; }

    // 和平时期：班师回朝，抵达都城即解散，兵力回流后备
    if (n.atWar.length === 0) {
      army.mode = 'home'; army.target = n.capitalTile;
      stepToward(world, army, 2);
      if (army.tile === n.capitalTile) {
        n.stats.military += Math.floor(army.size * 0.85);
        addBio(world, army.leaderId, '班师回朝，刀枪入库。');
        delete world.armies[army.id];
      }
      continue;
    }

    // 败战后撤退：数回合内只顾回援，不寻战、不占地（让胜方乘势推进）
    if (army.retreatUntil && army.retreatUntil > world.tick) {
      army.mode = 'home'; army.target = n.capitalTile;
      stepToward(world, army, 2);
      continue;
    }

    army.mode = 'march';
    // 偏师专攻其 focusEnemy；优先迎击近处敌军，其次进攻最近的敌方领土
    const focus = army.focusEnemy && world.nations[army.focusEnemy]?.alive && n.atWar.includes(army.focusEnemy)
      ? army.focusEnemy : undefined;
    let tgt = targetEnemyArmy(world, army);
    if (tgt === null && focus) tgt = nearestEnemyTile(world, army, focus);
    if (tgt === null) tgt = nearestEnemyTile(world, army);
    if (tgt === null) tgt = world.nations[n.atWar[0]]?.capitalTile ?? n.capitalTile;
    army.target = tgt;

    // 与敌军相邻 → 野战
    const foe = enemyArmyNear(world, army, fought);
    if (foe) { fieldBattle(world, army, foe, rng); fought.add(army.id); fought.add(foe.id); continue; }

    stepToward(world, army, 2);
    captureAround(world, army, rng);
  }
}

// ---------- 征召 / 分兵 / 解散 ----------
function raiseArmy(world: WorldState, n: Nation, enemyId: string, rng: Rng): void {
  void rng;
  const size = Math.floor(n.stats.military * 0.6);
  if (size < 15) return;
  n.stats.military -= size;
  const start = ownTileNearestTo(world, n, enemyId);
  const seq = world.armySeq++;
  const army: Army = { id: `A${seq}`, seq, nation: n.id, leaderId: n.generalId, tile: start, size, target: null, mode: 'march', prevTile: start };
  world.armies[army.id] = army;
  addBio(world, n.generalId, `统兵 ${size} 出征${world.nations[enemyId].name}。`);
}

function splitArmy(world: WorldState, big: Army, leader: Character, focus?: string): void {
  const det = Math.floor(big.size * 0.4);
  if (det < 22) return;
  big.size -= det;
  const seq = world.armySeq++;
  const army: Army = {
    id: `A${seq}`, seq, nation: big.nation, leaderId: leader.id, tile: big.tile,
    size: det, target: null, mode: 'march', prevTile: big.tile,
    ...(focus ? { focusEnemy: focus } : {}),
  };
  world.armies[army.id] = army;
  addBio(world, leader.id, '自主力分兵，独领偏师另开战线。');
  const who = leader.role === 'hero' ? `英雄${leader.name}` : `偏将${leader.name}`;
  const where = focus ? `转攻${world.nations[focus]?.name ?? '他国'}` : '转战他线';
  emitLog(world, 'major', `${world.nations[big.nation].name}兵分两路，${who}另领一军，${where}。`, ['war', 'split'], big.nation, big.tile);
}

// 是否值得另开一路：多线作战，或敌方有远离主力(>10格)的领土
function wantsSecondColumn(world: WorldState, n: Nation, big: Army): boolean {
  if (n.atWar.length >= 2) return true;
  const W = world.width, bx = big.tile % W, by = (big.tile / W) | 0;
  for (let i = 0; i < world.tiles.length; i++) {
    const o = world.tiles[i].owner;
    if (!o || !n.atWar.includes(o)) continue;
    if (Math.abs((i % W) - bx) + Math.abs(((i / W) | 0) - by) > 10) return true;
  }
  return false;
}

function nearestEnemyNation(world: WorldState, army: Army): string | undefined {
  const t = nearestEnemyTile(world, army);
  return t !== null ? world.tiles[t].owner ?? undefined : undefined;
}

function newSubCommander(world: WorldState, rng: Rng, n: Nation): Character {
  const c = makeCharacter(world, rng, n.id, n.species, 'general', '偏将');
  world.characters[c.id] = c;
  addBio(world, c.id, '行伍中脱颖而出，受命分领偏师。');
  return c;
}

function freeHero(world: WorldState, nid: string, leading: Set<string>): Character | null {
  for (const c of Object.values(world.characters)) {
    if (c.alive && c.nation === nid && c.role === 'hero' && !leading.has(c.id)) return c;
  }
  return null;
}

// ---------- 移动（BFS 寻路，绕开海洋/敌城，避免卡死）----------
function stepToward(world: WorldState, army: Army, steps: number): void {
  for (let s = 0; s < steps; s++) {
    if (army.target === null || army.tile === army.target) return;
    const next = nextStep(world, army, army.target);
    if (next === null) return;                 // 无路可走 → 原地（攻城/受阻）
    army.prevTile = army.tile;
    army.tile = next;
  }
}

// 可通行：本国 / 无主 / 敌方野地（可踏入并占领）；不可：海洋、敌方城市(堡垒)、第三国领土
function walkable(world: WorldState, i: number, self: string, enemies: string[]): boolean {
  const t = world.tiles[i];
  if (!TERRAIN[t.terrain].passable) return false;
  const o = t.owner;
  if (o === null || o === self) return true;
  if (enemies.includes(o)) return t.city === 0;
  return false;
}

// 返回朝目标推进的下一格。目标为敌城时，以"抵达其相邻格"为到达（围城）。
function nextStep(world: WorldState, army: Army, target: number): number | null {
  if (target === army.tile) return null;
  const self = army.nation;
  const enemies = world.nations[self].atWar;
  const W = world.width;
  const tt = world.tiles[target];
  const targetIsEnemyCity = tt.city > 0 && !!tt.owner && enemies.includes(tt.owner);
  const reached = (i: number): boolean =>
    targetIsEnemyCity
      ? (i !== army.tile && Math.abs((i % W) - (target % W)) + Math.abs(((i / W) | 0) - ((target / W) | 0)) === 1)
      : i === target;

  const prev = new Map<number, number>([[army.tile, -1]]);
  const q = [army.tile];
  let head = 0, goal = -1;
  while (head < q.length) {
    const cur = q[head++];
    if (cur !== army.tile && reached(cur)) { goal = cur; break; }
    if (head > 4000) break;                       // 探索上限
    for (const j of neighbors4(world, cur)) {
      if (prev.has(j) || !walkable(world, j, self, enemies)) continue;
      prev.set(j, cur); q.push(j);
    }
  }
  if (goal < 0) return null;
  let cur = goal;
  while (prev.get(cur) !== army.tile) {
    const p = prev.get(cur);
    if (p === undefined || p < 0) return null;
    cur = p;
  }
  return cur;
}

function targetEnemyArmy(world: WorldState, army: Army): number | null {
  const enemies = world.nations[army.nation].atWar;
  const W = world.width, ax = army.tile % W, ay = (army.tile / W) | 0;
  let best: number | null = null, bestD = 15;   // 仅迎击 15 格内的敌军
  for (const o of sortedArmies(world)) {
    if (o.id === army.id || !enemies.includes(o.nation)) continue;
    const d = Math.abs((o.tile % W) - ax) + Math.abs(((o.tile / W) | 0) - ay);
    if (d < bestD) { bestD = d; best = o.tile; }
  }
  return best;
}

// 先扫荡敌方野地（始终有目标可去），野地占尽再围攻敌城 —— 避免军队呆在城下不动。
// focus 指定时只针对该敌国（偏师专攻）。
function nearestEnemyTile(world: WorldState, army: Army, focus?: string): number | null {
  const enemies = world.nations[army.nation].atWar;
  if (enemies.length === 0) return null;
  const W = world.width, ax = army.tile % W, ay = (army.tile / W) | 0;
  let plain: number | null = null, dPlain = Infinity;
  let city: number | null = null, dCity = Infinity;
  for (let i = 0; i < world.tiles.length; i++) {
    const o = world.tiles[i].owner;
    if (!o) continue;
    if (focus ? o !== focus : !enemies.includes(o)) continue;
    const d = Math.abs((i % W) - ax) + Math.abs(((i / W) | 0) - ay);
    if (world.tiles[i].city > 0) { if (d < dCity) { dCity = d; city = i; } }
    else if (d < dPlain) { dPlain = d; plain = i; }
  }
  return plain ?? city;
}

function ownTileNearestTo(world: WorldState, n: Nation, enemyId: string): number {
  const W = world.width;
  const cap = world.nations[enemyId].capitalTile, cx = cap % W, cy = (cap / W) | 0;
  let best = n.capitalTile, bestD = Infinity;
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i].owner !== n.id) continue;
    const d = Math.abs((i % W) - cx) + Math.abs(((i / W) | 0) - cy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ---------- 野战 ----------
function enemyArmyNear(world: WorldState, army: Army, fought: Set<string>): Army | null {
  const W = world.width, ax = army.tile % W, ay = (army.tile / W) | 0;
  const enemies = world.nations[army.nation].atWar;
  for (const o of sortedArmies(world)) {
    if (o.id === army.id || fought.has(o.id) || !enemies.includes(o.nation)) continue;
    const d = Math.abs((o.tile % W) - ax) + Math.abs(((o.tile / W) | 0) - ay);
    if (d <= 1) return o;
  }
  return null;
}

function combatPowerArmy(world: WorldState, army: Army, rng: Rng): number {
  const n = world.nations[army.nation], s = n.stats;
  const supply = clamp(0.6 + s.food / 250, 0.6, 1.15);
  const order = clamp(0.55 + s.stability / 150, 0.55, 1.15);
  const will = clamp(0.5 + s.morale / 110, 0.5, 1.35);
  const leader = world.characters[army.leaderId];
  const lead = leader?.alive ? 0.85 + leader.ability / 250 : 0.8;
  const spc = SPECIES[n.species].mvp.military;
  const badger = n.species === 'badger' && s.morale < 45 ? 1.15 : 1;
  return Math.pow(Math.max(0, army.size), 0.9) * supply * order * will * lead * spc * badger * (0.8 + rng.next() * 0.4);
}

function fieldBattle(world: WorldState, A: Army, B: Army, rng: Rng): void {
  const pA = combatPowerArmy(world, A, rng), pB = combatPowerArmy(world, B, rng);
  const win = pA >= pB ? A : B, lose = pA >= pB ? B : A;
  const ratio = Math.max(pA, pB) / (Math.min(pA, pB) + 1);
  const lossFrac = clamp((ratio - 1) * 0.28 + 0.16, 0.12, 0.65);
  lose.size *= 1 - lossFrac;
  win.size *= 1 - lossFrac * 0.35;
  const wn = world.nations[win.nation], ln = world.nations[lose.nation];
  ln.stats.morale = clamp(ln.stats.morale - 3, 0, 100);
  wn.stats.morale = clamp(wn.stats.morale + 1, 0, 100);
  wn.stats.prestige = clamp(wn.stats.prestige + 1, 0, 100);
  if (rng.chance(0.25)) emitLog(world, 'medium', `${wn.name}的大军在沙场上击退了${ln.name}的军队。`, ['war', 'battle'], win.nation, win.tile);
  const wl = world.characters[win.leaderId];
  if (wl?.alive && rng.chance(0.3)) addBio(world, wl.id, `沙场鏖战，击退${ln.name}之师。`);
  if (lose.size < 12) destroyArmy(world, lose, rng);
  else lose.retreatUntil = world.tick + 4;   // 败军后撤休整
}

function destroyArmy(world: WorldState, army: Army, rng: Rng): void {
  const ln = world.nations[army.nation];
  emitLog(world, 'major', `${ln.name}的一支大军全军覆没。`, ['war', 'battle'], army.nation, army.tile);
  const leader = world.characters[army.leaderId];
  if (leader?.alive && rng.chance(0.5)) {
    leader.alive = false; leader.deathTick = world.tick;
    addBio(world, leader.id, '力战不退，战死沙场。');
    if (ln.alive && ln.generalId === leader.id) {
      const g = makeCharacter(world, rng, ln.id, ln.species, 'general', '继任大将');
      world.characters[g.id] = g; ln.generalId = g.id;
      addBio(world, g.id, `临危受命，接掌${ln.name}兵权。`);
    }
  }
  delete world.armies[army.id];
}

// ---------- 占领 / 攻城（从军队位置向外蔓延）----------
function captureAround(world: WorldState, army: Army, rng: Rng): void {
  const n = world.nations[army.nation];
  const budget = 1 + Math.floor(army.size / 45);
  // 起点：军队所在或相邻的敌方地块
  const starts: number[] = [];
  if (isEnemyTile(world, army.tile, n)) starts.push(army.tile);
  for (const j of neighbors4(world, army.tile)) if (isEnemyTile(world, j, n)) starts.push(j);
  if (starts.length === 0) return;

  const q = [...starts];
  const seen = new Set(starts);
  let claimed = 0;
  while (q.length > 0 && claimed < budget) {
    const i = q.shift()!;
    const t = world.tiles[i], o = t.owner;
    if (!o || !n.atWar.includes(o)) continue;
    const enemy = world.nations[o];

    if (t.city > 0) {
      // 城市是堡垒：围城逐渐消耗守军(攻城战)，须以绝对优势才能强攻得手
      enemy.stats.military = Math.max(0, enemy.stats.military - 4);   // 围城损耗
      enemy.stats.morale = clamp(enemy.stats.morale - 0.6, 0, 100);
      const need = totalStrength(world, o) * (0.8 + t.city * 0.45);
      if (army.size > need && rng.chance(0.4)) {
        const wasCapital = i === enemy.capitalTile;
        t.owner = n.id; t.city = Math.max(1, t.city - 1); t.dev = Math.max(6, t.dev - 12);
        enemy.stats.military *= 0.9;
        pushGrudge(enemy, n.id, world.tick); claimed++;
        emitLog(world, 'major', `${n.name}的大军历经苦战，攻陷了${enemy.name}的一座城池！`, ['war', 'siege'], n.id, i);
        addBio(world, army.leaderId, `督军破城，攻克${enemy.name}城池。`);
        if (wasCapital) { annex(world, n, enemy); return; }
      }
      continue;   // 城市阻断蔓延
    }

    // 普通敌地：占领并向相邻敌地继续蔓延（前线自然推进）
    t.owner = n.id; t.dev = Math.max(6, t.dev - 8);
    enemy.stats.military = Math.max(0, enemy.stats.military - 2);
    pushGrudge(enemy, n.id, world.tick); claimed++;
    for (const j of neighbors4(world, i)) {
      if (seen.has(j)) continue;
      if (isEnemyTile(world, j, n)) { seen.add(j); q.push(j); }
    }
  }
}

function isEnemyTile(world: WorldState, i: number, n: Nation): boolean {
  const o = world.tiles[i].owner;
  return !!o && n.atWar.includes(o);
}

// ---------- 吞并 ----------
export function annex(world: WorldState, winner: Nation, loser: Nation): void {
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i].owner === loser.id) { world.tiles[i].owner = winner.id; world.tiles[i].dev = Math.max(6, world.tiles[i].dev - 10); }
  }
  loser.alive = false;
  for (const m of Object.values(world.nations)) m.atWar = m.atWar.filter((x) => x !== loser.id);
  for (const id of Object.keys(world.armies)) if (world.armies[id].nation === loser.id) delete world.armies[id]; // 残军溃散
  winner.stats.prestige = clamp(winner.stats.prestige + 12, 0, 100);

  addBio(world, winner.rulerId, `在位期间灭亡${loser.name}，开疆拓土，名垂青史。`);
  const wgen = world.characters[winner.generalId];
  if (wgen?.alive) {
    wgen.prestige = clamp(wgen.prestige + 14, 0, 100);
    addBio(world, wgen.id, `率军攻灭${loser.name}，威震四方。`);
    if (wgen.prestige >= 80 && wgen.title !== '战神') { wgen.title = '战神'; addBio(world, wgen.id, '获尊号「战神」。'); }
  }
  for (const id of [loser.rulerId, loser.generalId]) {
    const c = world.characters[id];
    if (c?.alive) { c.alive = false; c.deathTick = world.tick; addBio(world, id, `${loser.name}亡国，随社稷一同殒落。`); }
  }
  emitLog(world, 'epic', `${winner.name}吞并了${loser.name}！${loser.name}的旗帜落下，疆域并入${winner.name}。`, ['epic', 'war', 'fall'], winner.id, loser.capitalTile);
}
