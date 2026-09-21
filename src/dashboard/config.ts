import type { Locale } from './i18n';

export interface GoalConfig {
  yearly: number;
  monthly: number;
  weekly: number;
  unit: 'distance' | 'time';
}

export const DEFAULT_LOCALE: Locale = 'zh';
export const DEFAULT_THEME: 'light' | 'dark' | 'system' = 'dark';

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

export const AVATAR =
  'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQTtc69JxHNcmN1ETpMUX4dozAgAN6iPjWalQ&usqp=CAU';
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';
