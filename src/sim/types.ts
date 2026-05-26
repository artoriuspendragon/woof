// 权威数据模型（见 docs/01-prototype-system-breakdown.md §1）
// sim/ 内禁止使用 Math.random()/Date.now() —— 一切随机走 rng，保证确定性。

export type TerrainType =
  | 'plain' | 'forest' | 'hill' | 'mountain'
  | 'lake' | 'river' | 'marsh' | 'sand' | 'snow';

export type ResourceType =
  | 'food' | 'wood' | 'stone' | 'iron' | 'fish' | 'bone'
  | 'honey' | 'berry' | 'mushroom' | 'catnip' | 'shiny';

export type Species = 'dog' | 'cat' | 'fox' | 'mole' | 'badger';

export type NationId = string;
export type CharId = string;

export interface Tile {
  terrain: TerrainType;
  resource: ResourceType | null;
  owner: NationId | null;
  dev: number;        // 开发度 0..100
  tint: number;       // 0..1 每格随机微亮度（仅渲染用，gen 时定）
  city: number;       // 0=无 1=城镇 2=城市 3=都城（首都）
}

export interface AiTraits {
  aggression: number; loyalty: number; expansion: number; trade: number;
  intrigue: number; engineering: number; tradition: number;
  curiosity: number; revenge: number; stability: number;
}

export interface NationStats {
  population: number; food: number; military: number;
  stability: number; morale: number; wealth: number;
  culture: number; prestige: number;
}

export type RelationStatus =
  | 'friendly' | 'neutral' | 'tense' | 'hostile'
  | 'allied' | 'vassal' | 'nemesis';
export type TreatyType = 'trade' | 'alliance' | 'truce';

export interface Relation {
  value: number;            // -100..100
  status: RelationStatus;
  treaties: TreatyType[];
  truceUntil?: number;      // tick，停战到期前不可再战
}

export interface Grudge {
  against: NationId;
  intensity: number;        // 随时间衰减
  sinceTick: number;
}

export type Personality =
  | 'kind' | 'irritable' | 'cunning' | 'lazy' | 'diligent'
  | 'vain' | 'paranoid' | 'warlike' | 'conservative' | 'gluttonous';

export type CharRole = 'king' | 'general' | 'hero';

export interface BioEntry { tick: number; text: string; }

export interface Character {
  id: CharId; name: string; nation: NationId; role: CharRole;
  title: string;            // 称号，如 "开国之君" "战神" "传奇英雄"
  loyalty: number; ambition: number; ability: number; prestige: number;
  personality: Personality;
  age: number;
  bornTick: number;
  deathTick?: number;
  alive: boolean;
  bio: BioEntry[];          // 列传：一生的关键事件
}

export type GoalKind =
  | 'develop' | 'expand' | 'fortify' | 'trade'
  | 'war' | 'intrigue' | 'festival' | 'survive';

// 军队实体：由将领/英雄统率，在地图上行军、作战、攻城；可分兵、转移战线。
export interface Army {
  id: string;
  seq: number;             // 数值序号（确定性排序用）
  nation: NationId;
  leaderId: CharId;        // 统帅（将领或英雄）
  tile: number;            // 当前位置
  size: number;            // 兵力
  target: number | null;   // 进军目标 tile
  mode: 'march' | 'home';  // march=作战 / home=班师
  prevTile: number;        // 上一位置（渲染行军动画用）
  retreatUntil?: number;   // 败战后撤退到该 tick 前不再寻战
  focusEnemy?: NationId;   // 偏师专攻的敌国（多线作战时分配）
}

export interface Nation {
  id: NationId;
  name: string;
  species: Species;
  color: string;            // 主色（渲染 + 卡片）
  capitalTile: number;
  rulerId: CharId;
  generalId: CharId;
  traits: AiTraits;
  stats: NationStats;
  territory: number;        // 缓存（权威来源 tiles[].owner）
  relations: Record<NationId, Relation>;
  goals: GoalKind[];        // 本 tick 决策结果（最近一次），供 UI 翻译"心情"
  memory: Grudge[];
  atWar: NationId[];        // 当前交战对象
  alive: boolean;
  fortify: number;          // 全国防御加成（fortify 行动累积）
}

export type LogLevel = 'minor' | 'medium' | 'major' | 'epic';
export interface LogEntry {
  id: number;
  tick: number;
  level: LogLevel;
  text: string;
  nation?: NationId;
  tile?: number;            // 事发地（供镜头定位 / 标记）
  tags: string[];
}

export interface WorldState {
  version: number;
  seed: number;
  rngState: number;
  tick: number;
  width: number;
  height: number;
  tiles: Tile[];
  nations: Record<NationId, Nation>;
  characters: Record<CharId, Character>;
  log: LogEntry[];
  logSeq: number;           // 自增日志 id
  charSeq: number;          // 自增角色 id（确定性、可序列化）
  armies: Record<string, Army>;
  armySeq: number;          // 自增军队 id
}

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_CN: Record<Season, string> = {
  spring: '春', summer: '夏', autumn: '秋', winter: '冬',
};

export function yearOf(tick: number): number { return Math.floor(tick / 4) + 1; }
export function seasonOf(tick: number): Season { return SEASONS[tick % 4]; }
export function idx(world: { width: number }, x: number, y: number): number {
  return y * world.width + x;
}
