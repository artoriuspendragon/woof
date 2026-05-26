import type { WorldState, Character } from '../types';
import { emitLog } from '../world';
import { makeCharacter, addBio } from '../people';
import { clamp, aliveNations } from '../util';
import type { Rng } from '../rng';

// 人物分布系统：角色老去、死亡、继承与新人崛起，并记录列传（docs/01 §9）。
export function characters(world: WorldState, rng: Rng): void {
  for (const c of Object.values(world.characters)) {
    if (!c.alive) continue;
    c.age += 0.25;
  }

  for (const n of aliveNations(world)) {
    const king = world.characters[n.rulerId];
    if (king?.alive && rng.chance(deathChance(king))) {
      die(world, king, '寿终正寝');
      const heir = makeCharacter(world, rng, n.id, n.species, 'king', '继位之君');
      world.characters[heir.id] = heir;
      n.rulerId = heir.id;
      if (heir.ambition > 65 && heir.prestige < 45) {
        n.stats.stability = clamp(n.stats.stability - 12, 0, 100);
        n.stats.morale = clamp(n.stats.morale - 6, 0, 100);
        addBio(world, heir.id, `在${n.name}的继承危机中强势登基，朝局动荡。`);
        emitLog(world, 'epic', `${king.name}驾崩，${n.name}陷入继承危机，野心勃勃的${heir.name}强行登基。`,
          ['internal', 'succession'], n.id, n.capitalTile);
      } else {
        addBio(world, heir.id, `继位为${n.name}新君。`);
        emitLog(world, 'major', `${king.name}寿终正寝，${heir.name}继位为${n.name}新君。`,
          ['internal', 'succession'], n.id, n.capitalTile);
      }
    }

    const general = world.characters[n.generalId];
    if (general?.alive && rng.chance(deathChance(general))) {
      die(world, general, '功成身退，溘然长逝');
      const succ = makeCharacter(world, rng, n.id, n.species, 'general', '新任大将');
      world.characters[succ.id] = succ;
      n.generalId = succ.id;
      addBio(world, succ.id, `接掌${n.name}兵权，受封大将。`);
      emitLog(world, 'minor', `${n.name}老将${general.name}卸甲归田，${succ.name}接掌兵权。`,
        ['internal'], n.id, n.capitalTile);
    }
  }

  // 英雄等其他角色：自然老去而逝，不设继承
  for (const c of Object.values(world.characters)) {
    if (!c.alive || c.role === 'king' || c.role === 'general') continue;
    if (rng.chance(deathChance(c))) {
      die(world, c, '走完传奇的一生');
      if (world.nations[c.nation]?.alive) {
        emitLog(world, 'minor', `${world.nations[c.nation].name}的${c.title}${c.name}逝世，民间为之立碑。`,
          ['internal', 'story'], c.nation, world.nations[c.nation].capitalTile);
      }
    }
  }
}

function deathChance(c: Character): number {
  return Math.max(0, (c.age - 52) * 0.012) + 0.002;
}

function die(world: WorldState, c: Character, how: string): void {
  c.alive = false;
  c.deathTick = world.tick;
  addBio(world, c.id, `${how}，享年 ${Math.round(c.age)} 岁。`);
}
