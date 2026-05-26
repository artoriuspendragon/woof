import type { TerrainType, Season } from '../sim/types';

export interface TerrainDef {
  name: string;
  color: string;             // 基础色（清新低饱和）
  passable: boolean;         // 可否被占领/居住
  yield: { food: number; wood: number; stone: number; gold: number };
  defense: number;           // 防御加成（war 结算）
}

// GDD §4.2
export const TERRAIN: Record<TerrainType, TerrainDef> = {
  plain:    { name: '平原', color: '#bcd98a', passable: true,  yield: { food: 3, wood: 0, stone: 0, gold: 1 }, defense: 0 },
  forest:   { name: '森林', color: '#7fb069', passable: true,  yield: { food: 1, wood: 3, stone: 0, gold: 1 }, defense: 1 },
  hill:     { name: '丘陵', color: '#c2b280', passable: true,  yield: { food: 1, wood: 1, stone: 2, gold: 1 }, defense: 2 },
  mountain: { name: '山地', color: '#9a8f80', passable: true,  yield: { food: 0, wood: 0, stone: 3, gold: 1 }, defense: 4 },
  lake:     { name: '湖泊', color: '#7fc1e3', passable: false, yield: { food: 2, wood: 0, stone: 0, gold: 1 }, defense: 0 },
  river:    { name: '河流', color: '#92cfe8', passable: false, yield: { food: 2, wood: 0, stone: 0, gold: 2 }, defense: 1 },
  marsh:    { name: '沼泽', color: '#9fb486', passable: true,  yield: { food: 1, wood: 1, stone: 0, gold: 0 }, defense: 1 },
  sand:     { name: '沙地', color: '#e6d6a8', passable: true,  yield: { food: 0, wood: 0, stone: 1, gold: 1 }, defense: 0 },
  snow:     { name: '雪地', color: '#e8eef2', passable: true,  yield: { food: 0, wood: 1, stone: 1, gold: 1 }, defense: 1 },
};

// 季节系数（农业为主，冬季普遍降低）
const SEASON_FOOD: Record<Season, number> = {
  spring: 1.15, summer: 1.0, autumn: 1.1, winter: 0.55,
};
export function seasonFoodMul(season: Season): number { return SEASON_FOOD[season]; }
