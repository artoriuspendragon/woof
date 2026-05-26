// 确定性 PRNG（mulberry32）：单状态、可序列化。
// 全项目随机的唯一来源。世界状态保存 rngState，读档即重现历史。

export interface Rng {
  state: number;
  next(): number;           // [0,1)
  int(n: number): number;   // [0,n)
  range(a: number, b: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
}

export function makeRng(seed: number): Rng {
  let s = seed | 0;
  const rng: Rng = {
    get state() { return s; },
    set state(v: number) { s = v | 0; },
    next() {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) { return Math.floor(rng.next() * n); },
    range(a, b) { return a + rng.next() * (b - a); },
    chance(p) { return rng.next() < p; },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
  };
  return rng;
}
