import type { Nation, Personality, LogLevel, CharRole } from '../sim/types';
import { t } from './i18n';

// 与语言无关的图标
export const ROLE_ICON: Record<CharRole, string> = { king: '👑', general: '🛡️', hero: '⭐' };
export const LEVEL_ICON: Record<LogLevel, string> = { minor: '🌾', medium: '🍃', major: '⚔️', epic: '✨' };

// 标签：调用时取当前语言
export const roleLabel = (r: CharRole): string => t(`role.${r}`);
export const personalityLabel = (p: Personality): string => t(`personality.${p}`);

export function moodText(n: Nation): string {
  if (n.atWar.length > 0) return t('mood.atwar');
  return t(`mood.${n.goals[0] ?? 'develop'}`);
}

export function relationWord(value: number): { t: string; c: string } {
  if (value >= 60) return { t: t('rel.friendly'), c: '#3a8a4a' };
  if (value >= 10) return { t: t('rel.cordial'),  c: '#6aa15a' };
  if (value > -10) return { t: t('rel.civil'),    c: '#888' };
  if (value > -40) return { t: t('rel.wary'),     c: '#c98a2a' };
  if (value > -75) return { t: t('rel.hostile'),  c: '#c8502a' };
  return { t: t('rel.nemesis'), c: '#b02a1a' };
}

export const norm = (value: number, max: number): number => Math.max(0, Math.min(1, value / max));

// 数值 → 译文：传入 [阈值, i18n 键] 列表，返回 t(键)
export function qualitative(value: number, bands: [number, string][]): string {
  for (const [th, k] of bands) if (value >= th) return t(k);
  return t(bands[bands.length - 1][1]);
}
