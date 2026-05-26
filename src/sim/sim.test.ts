import { describe, it, expect } from 'vitest';
import { createWorld } from './world';
import { tick } from './tick';
import type { WorldState } from './types';

function run(seed: number, ticks: number): WorldState {
  const w = createWorld(seed, 80, 52);
  for (let i = 0; i < ticks; i++) tick(w);
  return w;
}

function finite(n: number): boolean { return Number.isFinite(n); }

describe('simulation', () => {
  it('runs 400 ticks without producing NaN / negative core stats', () => {
    const w = run(12345, 400);
    expect(w.tick).toBe(400);
    for (const n of Object.values(w.nations)) {
      const s = n.stats;
      for (const v of Object.values(s)) expect(finite(v)).toBe(true);
      expect(s.population).toBeGreaterThanOrEqual(0);
      expect(s.food).toBeGreaterThanOrEqual(0);
      expect(s.military).toBeGreaterThanOrEqual(0);
      expect(s.stability).toBeLessThanOrEqual(100);
    }
    expect(w.log.length).toBeGreaterThan(20);
  });

  it('is deterministic: same seed → identical chronicle', () => {
    const a = run(777, 200);
    const b = run(777, 200);
    const textsA = a.log.map((e) => `${e.tick}|${e.level}|${e.text}`);
    const textsB = b.log.map((e) => `${e.tick}|${e.level}|${e.text}`);
    expect(textsA).toEqual(textsB);
    // 领土也应逐格相同
    expect(a.tiles.map((t) => t.owner)).toEqual(b.tiles.map((t) => t.owner));
  });

  it('different seeds → different histories', () => {
    const a = run(1, 200);
    const b = run(2, 200);
    expect(a.log.map((e) => e.text)).not.toEqual(b.log.map((e) => e.text));
  });

  it('produces emergent drama: wars and territory change occur', () => {
    const w = run(54321, 300);
    const warLogs = w.log.filter((e) => e.tags.includes('war'));
    expect(warLogs.length).toBeGreaterThan(0);
    // 至少一个国家疆域明显变化（扩张或被吞）
    const territories = Object.values(w.nations).map((n) => n.territory);
    expect(Math.max(...territories)).toBeGreaterThan(20);
  });

  it('builds cities (capital + founded towns)', () => {
    const w = run(54321, 300);
    let towns = 0, capitals = 0;
    for (const t of w.tiles) { if (t.city === 3) capitals++; else if (t.city > 0) towns++; }
    expect(capitals).toBeGreaterThanOrEqual(1);
    expect(towns).toBeGreaterThan(0);
  });

  it('cities are fortresses: sieges are far rarer than border battles', () => {
    const w = run(54321, 380);
    const sieges = w.log.filter((e) => e.tags.includes('siege')).length;
    const battles = w.log.filter((e) => e.tags.includes('battle')).length;
    expect(battles).toBeGreaterThan(0);
    expect(sieges).toBeLessThan(battles);   // 攻陷城市远难于普通边境战
  });

  it('records people with biographies', () => {
    const w = run(54321, 300);
    const chars = Object.values(w.characters);
    expect(chars.length).toBeGreaterThan(10);            // 开局 10 人 + 后续继承/英雄
    expect(chars.every((c) => c.bio.length > 0)).toBe(true);
    // 应出现过将领或英雄（非仅国王）
    expect(chars.some((c) => c.role === 'general')).toBe(true);
  });
});
