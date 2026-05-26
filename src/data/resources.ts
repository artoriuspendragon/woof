import type { ResourceType, TerrainType } from '../sim/types';

export interface ResourceDef {
  name: string;
  emoji: string;
  yield: { food: number; gold: number; military: number };
  spawnOn: TerrainType[];    // 可生成的地形
  luxury: boolean;           // 奢侈/特殊资源（偏好命中加成更明显）
}

// GDD §4.3（可爱化资源）
export const RESOURCE: Record<ResourceType, ResourceDef> = {
  food:     { name: '丰土',   emoji: '🌾', yield: { food: 4, gold: 0, military: 0 }, spawnOn: ['plain', 'marsh'], luxury: false },
  wood:     { name: '林场',   emoji: '🪵', yield: { food: 0, gold: 1, military: 1 }, spawnOn: ['forest'], luxury: false },
  stone:    { name: '石矿',   emoji: '🪨', yield: { food: 0, gold: 1, military: 1 }, spawnOn: ['hill', 'mountain'], luxury: false },
  iron:     { name: '铁矿',   emoji: '⛏️', yield: { food: 0, gold: 1, military: 3 }, spawnOn: ['hill', 'mountain'], luxury: false },
  fish:     { name: '鱼塘',   emoji: '🐟', yield: { food: 3, gold: 1, military: 0 }, spawnOn: ['lake', 'river'], luxury: false },
  bone:     { name: '骨冢',   emoji: '🦴', yield: { food: 1, gold: 2, military: 1 }, spawnOn: ['plain', 'sand'], luxury: true },
  honey:    { name: '蜜林',   emoji: '🍯', yield: { food: 2, gold: 3, military: 0 }, spawnOn: ['forest'], luxury: true },
  berry:    { name: '浆果丛', emoji: '🫐', yield: { food: 2, gold: 2, military: 0 }, spawnOn: ['forest', 'plain'], luxury: true },
  mushroom: { name: '菇田',   emoji: '🍄', yield: { food: 3, gold: 1, military: 0 }, spawnOn: ['hill', 'marsh', 'forest'], luxury: true },
  catnip:   { name: '猫薄荷', emoji: '🌿', yield: { food: 1, gold: 4, military: 0 }, spawnOn: ['plain', 'forest'], luxury: true },
  shiny:    { name: '闪闪石', emoji: '💎', yield: { food: 0, gold: 6, military: 0 }, spawnOn: ['mountain', 'hill', 'sand'], luxury: true },
};

export const RESOURCE_TYPES = Object.keys(RESOURCE) as ResourceType[];
