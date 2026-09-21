import type { ActivityMode } from '@/modules/activity/profiles';

export type DashboardLocale = 'zh' | 'en';

interface ActivityPresentation {
  icon: string;
  labelZh: string;
  labelEn: string;
  primaryColor: string;
  highlightColor: string;
  longDistanceKm: number;
  performanceKind: 'pace' | 'speed';
}

const PRESENTATIONS: Record<ActivityMode, ActivityPresentation> = {
  running: {
    icon: '🏃',
    labelZh: '跑步',
    labelEn: 'Run',
    primaryColor: '#f97316',
    highlightColor: '#ef4444',
    longDistanceKm: 20,
    performanceKind: 'pace',
  },
  cycling: {
    icon: '🚴',
    labelZh: '骑行',
    labelEn: 'Ride',
    primaryColor: '#3b82f6',
    highlightColor: '#8b5cf6',
    longDistanceKm: 50,
    performanceKind: 'speed',
  },
  hiking: {
    icon: '🥾',
    labelZh: '徒步',
    labelEn: 'Hike',
    primaryColor: '#22c55e',
    highlightColor: '#15803d',
    longDistanceKm: 10,
    performanceKind: 'speed',
  },
};

const formatPace = (speedMs: number): string => {
  if (!Number.isFinite(speedMs) || speedMs <= 0) return '--';
  const totalSeconds = Math.round(1000 / speedMs);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const getActivityPresentation = (
  mode: ActivityMode
): ActivityPresentation => PRESENTATIONS[mode];

export const formatActivityPerformance = (
  speedMs: number,
  mode: ActivityMode,
  locale: DashboardLocale
) => {
  const presentation = getActivityPresentation(mode);
  const isPace = presentation.performanceKind === 'pace';
  const value =
    Number.isFinite(speedMs) && speedMs > 0
      ? isPace
        ? formatPace(speedMs)
        : (speedMs * 3.6).toFixed(1)
      : '--';
  const unit = isPace ? '/km' : 'km/h';

  return {
    label: isPace
      ? locale === 'zh'
        ? '配速'
        : 'Pace'
      : locale === 'zh'
        ? '速度'
        : 'Speed',
    averageLabel: isPace
      ? locale === 'zh'
        ? '均配速'
        : 'Avg Pace'
      : locale === 'zh'
        ? '均速'
        : 'Avg Speed',
    bestLabel: isPace
      ? locale === 'zh'
        ? '最快配速'
        : 'Fastest pace'
      : locale === 'zh'
        ? '最高均速'
        : 'Top avg speed',
    value,
    unit,
    display: value === '--' ? value : `${value} ${unit}`,
  };
};

export const getDistanceFilterOptions = (
  mode: ActivityMode
): readonly number[] => {
  if (mode === 'cycling') return [20, 50, 100];
  if (mode === 'hiking') return [5, 10, 20];
  return [10, 20, 40];
};

export const getTrackColor = (
  mode: ActivityMode,
  distanceMeters: number
): string => {
  const presentation = getActivityPresentation(mode);
  return distanceMeters / 1000 >= presentation.longDistanceKm
    ? presentation.highlightColor
    : presentation.primaryColor;
};

export const getActivityTypeLabel = (
  mode: ActivityMode,
  type: string,
  locale: DashboardLocale
): string => {
  if (mode === 'cycling' && type === 'VirtualRide') {
    return locale === 'zh' ? '虚拟骑行' : 'Virtual Ride';
  }
  const presentation = getActivityPresentation(mode);
  return locale === 'zh' ? presentation.labelZh : presentation.labelEn;
};
