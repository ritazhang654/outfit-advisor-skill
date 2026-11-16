import type { Occasion } from './types';

export type ScheduleChoice = 'auto' | 'meeting' | 'outing' | 'nice';

// 默认周几规则：周一正式（有会）、周二三四好看、周五周末休闲
export const DEFAULT_WEEKDAY_RULES: Record<string, Occasion> = {
  '1': 'formal',
  '2': 'nice',
  '3': 'nice',
  '4': 'nice',
  '5': 'casual',
  '6': 'casual',
  '0': 'casual',
};

export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 由日期字符串（YYYY-MM-DD）安全计算周几（避免时区偏移）
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`日期格式无效: ${date}`);
  return new Date(y, m - 1, d).getDay();
}

export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// 明日安排 + 周几规则 → 最终场合
export function resolveOccasion(date: string, schedule: ScheduleChoice, rules?: Record<string, string> | null): Occasion {
  if (schedule === 'meeting') return 'formal';
  if (schedule === 'outing') return 'casual';
  if (schedule === 'nice') return 'nice';
  const merged = { ...DEFAULT_WEEKDAY_RULES, ...(rules ?? {}) };
  const weekday = weekdayOf(date);
  const occasion = merged[String(weekday)];
  if (occasion === 'formal' || occasion === 'nice' || occasion === 'casual') return occasion;
  return 'casual';
}

export const OCCASION_PROMPT: Record<Occasion, string> = {
  formal: '正式场合（如开会有领导参加、商务会面），需要得体、专业、有质感，优先正式度高的单品',
  nice: '日常通勤，没有硬性着装要求，重点是把日常穿好看、有时尚感、搭配协调',
  casual: '休闲场合（周五或周末），舒适放松为主，可以穿得随意、有活力',
};
