import type { Species, AiTraits, TerrainType, ResourceType } from '../sim/types';

export interface SpeciesDef {
  species: Species;
  name: string;
  emoji: string;
  color: string;                 // 柔和主色（GDD §9 配色方向）
  baseTraits: AiTraits;          // GDD §7.1
  preferredTerrain: TerrainType[];
  preferredResources: ResourceType[];
  // MVP 能力（GDD §16.4）
  mvp: { food: number; military: number; defense: number; culture: number; stability: number };
  capitalNames: string[];
  rulerNames: string[];
}

export const SPECIES: Record<Species, SpeciesDef> = {
  dog: {
    species: 'dog', name: '狗国', emoji: '🐶', color: '#e8954a',
    baseTraits: { aggression: 60, loyalty: 85, expansion: 65, trade: 45, intrigue: 30, engineering: 55, tradition: 70, curiosity: 60, revenge: 65, stability: 80 },
    preferredTerrain: ['plain', 'forest', 'hill'],
    preferredResources: ['bone', 'food', 'iron'],
    mvp: { food: 1.0, military: 1.2, defense: 1.0, culture: 1.0, stability: 1.1 },
    capitalNames: ['汪都', '忠骨城', '巡边堡', '金毛港'],
    rulerNames: ['阿汪一世', '忠心王', '巴顿大公', '咚咚陛下', '金鬃王', '铁卫公', '雪原侯', '阿福大帝', '守诺王', '巡边公'],
  },
  cat: {
    species: 'cat', name: '猫猫国', emoji: '🐱', color: '#d96f9b',
    baseTraits: { aggression: 40, loyalty: 45, expansion: 45, trade: 80, intrigue: 70, engineering: 50, tradition: 45, curiosity: 55, revenge: 50, stability: 45 },
    preferredTerrain: ['forest', 'plain', 'lake'],
    preferredResources: ['fish', 'catnip', 'shiny'],
    mvp: { food: 1.0, military: 0.95, defense: 1.0, culture: 1.2, stability: 0.9 },
    capitalNames: ['软爪城', '喵帝都', '猫薄荷港', '橘月城'],
    rulerNames: ['喵可大帝', '布偶女王', '橘胖陛下', '三花圣女', '夜瞳女皇', '缅因伯', '暹罗智王', '奶牛公', '玳瑁夫人', '银铃女王'],
  },
  fox: {
    species: 'fox', name: '狐狸国', emoji: '🦊', color: '#d2453a',
    baseTraits: { aggression: 35, loyalty: 35, expansion: 55, trade: 85, intrigue: 95, engineering: 45, tradition: 40, curiosity: 70, revenge: 60, stability: 55 },
    preferredTerrain: ['forest', 'sand', 'snow'],
    preferredResources: ['berry', 'honey', 'shiny'],
    mvp: { food: 1.0, military: 0.9, defense: 1.0, culture: 1.05, stability: 1.0 },
    capitalNames: ['赤狐城', '九尾宫', '银市', '沙商埠'],
    rulerNames: ['银影公', '赤狐宰执', '九尾大人', '狡黠王', '雾隐公', '沙商王', '银霜侯', '火尾大人', '红萝女公', '七谋士'],
  },
  mole: {
    species: 'mole', name: '地鼠国', emoji: '🐭', color: '#9c7a52',
    baseTraits: { aggression: 25, loyalty: 70, expansion: 50, trade: 55, intrigue: 45, engineering: 95, tradition: 60, curiosity: 45, revenge: 40, stability: 70 },
    preferredTerrain: ['hill', 'mountain', 'plain'],
    preferredResources: ['mushroom', 'iron', 'stone'],
    mvp: { food: 1.25, military: 0.9, defense: 1.05, culture: 1.0, stability: 1.0 },
    capitalNames: ['深坑城', '矿脉都', '仓鼠仓', '地道枢'],
    rulerNames: ['老钻陛下', '仓鼠总管', '掘进王', '储粮公', '深掘帝', '土公', '岩鼠王', '囤金侯', '地龙陛下', '钻钻大公'],
  },
  badger: {
    species: 'badger', name: '獾国', emoji: '🦡', color: '#6b7b8c',
    baseTraits: { aggression: 45, loyalty: 75, expansion: 40, trade: 35, intrigue: 25, engineering: 70, tradition: 90, curiosity: 35, revenge: 95, stability: 85 },
    preferredTerrain: ['mountain', 'hill', 'forest'],
    preferredResources: ['stone', 'honey', 'iron'],
    mvp: { food: 1.0, military: 1.0, defense: 1.3, culture: 0.95, stability: 1.1 },
    capitalNames: ['山堡', '白獾祠', '不让关', '蜜獾砦'],
    rulerNames: ['老獾长老', '复仇者公', '白须法官', '蜜獾酋', '山岳公', '顽石王', '蜜爪侯', '守关大长老', '铁壁王', '复夏公'],
  },
};

export const SPECIES_ORDER: Species[] = ['dog', 'cat', 'fox', 'mole', 'badger'];
