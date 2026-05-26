import type { Species } from '../sim/types';

// GDD §6 自然初始关系（取代表性单值；双值 §6 取偏负一端以制造张力）
const PAIRS: Array<[Species, Species, number]> = [
  ['dog', 'cat', -10],
  ['dog', 'fox', -15],
  ['dog', 'mole', 5],
  ['dog', 'badger', 10],
  ['cat', 'fox', -12],     // “互相欣赏，也互相算计” → 偏算计
  ['cat', 'mole', -10],
  ['cat', 'badger', -5],
  ['fox', 'mole', 5],
  ['fox', 'badger', -20],
  ['mole', 'badger', -15],
];

export function naturalRelation(a: Species, b: Species): number {
  if (a === b) return 20;
  for (const [x, y, v] of PAIRS) {
    if ((x === a && y === b) || (x === b && y === a)) return v;
  }
  return 0;
}
