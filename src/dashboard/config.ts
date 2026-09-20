import type { Locale } from './i18n';

export interface GoalConfig {
  yearly: number;
  monthly: number;
  weekly: number;
  unit: 'distance' | 'time';
}

export const DEFAULT_LOCALE: Locale = 'zh';
export const DEFAULT_THEME: 'light' | 'dark' | 'system' = 'system';

export const DEFAULT_GOAL: GoalConfig = {
  yearly: 2000,
  monthly: 150,
  weekly: 35,
  unit: 'distance',
};

export const GOALS: Record<string, GoalConfig> = {
  all: DEFAULT_GOAL,
  Run: DEFAULT_GOAL,
};

export const AVATAR = 'https://github.com/Dylan632.png';
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
