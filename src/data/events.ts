import type { Nation, WorldState, LogLevel, Season } from '../sim/types';
import type { Rng } from '../sim/rng';
import { SEASON_CN, yearOf } from '../sim/types';
import { makeCharacter, addBio } from '../sim/people';

export interface EventCtx {
  world: WorldState;
  nation: Nation;
  rng: Rng;
  season: Season;
  figure?: string;          // 本次事件涉及的人物名（apply 写，text 读）
  emit: (level: LogLevel, text: string, tags: string[]) => void;
}

export interface EventDef {
  id: string;
  level: LogLevel;
  tags: string[];
  probability: number;
  check: (n: Nation, c: EventCtx) => boolean;
  apply: (n: Nation, c: EventCtx) => void;
  text: (n: Nation, c: EventCtx) => string;
}

const head = (c: EventCtx) => `第${yearOf(c.world.tick)}年${SEASON_CN[c.season]}`;

// 数据驱动的触发事件（GDD §12.2 / §14.3）。系统事件（战争/扩张/继承）由各系统直接 emit。
export const EVENT_DEFS: EventDef[] = [
  {
    id: 'harvest_good', level: 'minor', tags: ['economy'], probability: 0.18,
    check: (n, c) => (c.season === 'spring' || c.season === 'autumn') && n.stats.food > 40,
    apply: (n) => { n.stats.food += 25; n.stats.morale = Math.min(100, n.stats.morale + 3); },
    text: (n, c) => `${head(c)}，${n.name}的牧场迎来丰收，储备的食物更多了。`,
  },
  {
    id: 'festival', level: 'minor', tags: ['culture'], probability: 0.14,
    check: (n) => n.traits.trade > 55 || n.species === 'cat',
    apply: (n) => { n.stats.culture += 4; n.stats.morale = Math.min(100, n.stats.morale + 5); n.stats.wealth = Math.max(0, n.stats.wealth - 4); },
    text: (n, c) => {
      const fes = n.species === 'cat' ? '樱花祭' : n.species === 'dog' ? '骨头节' : n.species === 'badger' ? '蜜獾庆典' : '丰年集';
      return `${head(c)}，${n.name}举办${fes}，吸引了许多游客，城里热闹非凡。`;
    },
  },
  {
    id: 'mine_found', level: 'medium', tags: ['economy', 'engineering'], probability: 0.1,
    check: (n) => n.traits.engineering > 60 && n.stats.population > 120,
    apply: (n) => { n.stats.wealth += 12; n.stats.military += 6; },
    text: (n, c) => `${head(c)}，${n.name}挖通了新的矿脉，资源储量大增。`,
  },
  {
    id: 'trade_boom', level: 'medium', tags: ['economy', 'diplomacy'], probability: 0.12,
    check: (n) => n.traits.trade > 60 && Object.values(n.relations).some((r) => r.treaties.includes('trade')),
    apply: (n) => { n.stats.wealth += 14; n.stats.prestige += 2; },
    text: (n, c) => `${head(c)}，${n.name}的商队往来频繁，贸易收入显著上升。`,
  },
  {
    id: 'noble_unrest', level: 'medium', tags: ['internal'], probability: 0.1,
    // 只在"可恢复区间"触发：避免国家跌到谷底后被永久压制（死亡螺旋）
    check: (n) => n.stats.stability >= 28 && n.stats.stability < 46 && n.stats.morale < 58,
    apply: (n) => { n.stats.stability = Math.max(0, n.stats.stability - 4); },
    text: (n, c) => `${head(c)}，${n.name}的贵族对王室颇有微词，朝堂气氛紧张。`,
  },
  {
    id: 'golden_age', level: 'epic', tags: ['internal', 'epic'], probability: 0.05,
    check: (n) => n.stats.stability > 78 && n.stats.culture > 70 && n.stats.food > 60,
    apply: (n) => { n.stats.morale = Math.min(100, n.stats.morale + 8); n.stats.prestige += 8; n.stats.culture += 6; },
    text: (n, c) => `${head(c)}，${n.name}迎来黄金时代，万民称颂，史官提笔记下这盛世。`,
  },
  {
    id: 'hero_legend', level: 'major', tags: ['story', 'war'], probability: 0.18,
    check: (n) => n.atWar.length > 0 && n.stats.morale < 60,
    apply: (n, c) => {
      n.stats.military += 14; n.stats.morale = Math.min(100, n.stats.morale + 10); n.stats.prestige += 5;
      const hero = makeCharacter(c.world, c.rng, n.id, n.species, 'hero', '传奇英雄');
      c.world.characters[hero.id] = hero;
      addBio(c.world, hero.id, `于${n.name}危难之际崛起，力挽狂澜，鼓舞全军。`);
      c.figure = hero.name;
    },
    text: (n, c) => `${head(c)}，危难之际，${n.name}涌现传奇英雄${c.figure ?? ''}，鼓舞了全军士气。`,
  },
  {
    id: 'mole_caution', level: 'minor', tags: ['story'], probability: 0.08,
    check: (n) => n.species === 'mole' && n.stats.wealth > 60,
    apply: (n) => { n.stats.food += 10; },
    text: (n, c) => `${head(c)}，${n.name}又往地下粮仓囤了一批蘑菇，仓鼠总管露出满意的笑。`,
  },
];
