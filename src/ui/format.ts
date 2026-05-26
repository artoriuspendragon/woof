import type { Nation, Personality, GoalKind, LogLevel, CharRole } from '../sim/types';

export const ROLE_CN: Record<CharRole, string> = { king: '国王', general: '大将', hero: '英雄' };
export const ROLE_ICON: Record<CharRole, string> = { king: '👑', general: '🛡️', hero: '⭐' };

export const PERSONALITY_CN: Record<Personality, string> = {
  kind: '仁慈', irritable: '暴躁', cunning: '狡猾', lazy: '懒惰', diligent: '勤勉',
  vain: '虚荣', paranoid: '多疑', warlike: '好战', conservative: '守成', gluttonous: '贪吃',
};

const MOOD: Record<GoalKind, string> = {
  develop: '专心经营内政 🏡', expand: '忙着开拓边疆 🧭', fortify: '加固边防工事 🧱',
  trade: '张罗商队贸易 🪙', festival: '筹备节庆 🎉', intrigue: '暗中布局 🕯️',
  survive: '为渡过饥荒发愁 😣', war: '调兵遣将 ⚔️',
};

export function moodText(n: Nation): string {
  if (n.atWar.length > 0) return '正在与邻国交战 ⚔️';
  return MOOD[n.goals[0] ?? 'develop'];
}

export function relationWord(value: number): { t: string; c: string } {
  if (value >= 60) return { t: '友好', c: '#3a8a4a' };
  if (value >= 10) return { t: '亲善', c: '#6aa15a' };
  if (value > -10) return { t: '客气', c: '#888' };
  if (value > -40) return { t: '提防', c: '#c98a2a' };
  if (value > -75) return { t: '敌对', c: '#c8502a' };
  return { t: '宿敌', c: '#b02a1a' };
}

// 把数值折算成 0..1 用于木条
export function norm(value: number, max: number): number {
  return Math.max(0, Math.min(1, value / max));
}

export function qualitative(value: number, words: [number, string][]): string {
  for (const [th, w] of words) if (value >= th) return w;
  return words[words.length - 1][1];
}

export const LEVEL_ICON: Record<LogLevel, string> = {
  minor: '🌾', medium: '🍃', major: '⚔️', epic: '✨',
};
