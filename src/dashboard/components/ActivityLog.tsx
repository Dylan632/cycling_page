import { useState, useMemo } from 'react';
import type { Activity, SportFilter } from '../types';
import { formatDuration } from '../hooks/useActivities';
import { useLocale } from '../hooks/useLocale';
import { useActivityMode } from '@/modules/activity/ActivityModeProvider';
import {
  formatActivityPerformance,
  getActivityPresentation,
  getActivityTypeLabel,
  getDistanceFilterOptions,
} from '../utils/activityPresentation';

interface ActivityLogProps {
  activities: Activity[];
  years: number[];
  year: number | null;
  setYear: (y: number | null) => void;
  selectedActivity?: Activity | null;
  onSelectActivity?: (a: Activity | null) => void;
  filter?: SportFilter;
}

const PAGE_SIZE = 16;

type DistanceFilter = 'all' | `${number}`;

export function ActivityLog({
  activities,
  years,
  year,
  setYear,
  selectedActivity,
  onSelectActivity,
}: ActivityLogProps) {
  const { t, locale } = useLocale();
  const { mode } = useActivityMode();
  const presentation = getActivityPresentation(mode);
  const performance = formatActivityPerformance(0, mode, locale);
  const distanceOptions = getDistanceFilterOptions(mode);
  const [page, setPage] = useState(0);
  const [distFilter, setDistFilter] = useState<DistanceFilter>('all');

  const sorted = useMemo(() => {
    const filtered = activities.filter((a) => {
      const km = a.distance / 1000;
      if (distFilter === 'all') return true;
      return km >= Number(distFilter);
    });
    return filtered.sort(
      (a, b) =>
        new Date(b.start_date_local).getTime() -
        new Date(a.start_date_local).getTime()
    );
  }, [activities, distFilter]);
  const selectedId = selectedActivity?.run_id;
  const [previousSelection, setPreviousSelection] = useState(selectedId);
  const [previousSorted, setPreviousSorted] = useState(sorted);
  if (previousSelection !== selectedId || previousSorted !== sorted) {
    setPreviousSelection(selectedId);
    setPreviousSorted(sorted);
    const idx = sorted.findIndex((a) => a.run_id === selectedId);
    if (idx >= 0) {
      setPage(Math.floor(idx / PAGE_SIZE));
    } else if (selectedId != null && distFilter !== 'all') {
      setDistFilter('all');
    } else {
      setPage(
        Math.min(page, Math.max(0, Math.ceil(sorted.length / PAGE_SIZE) - 1))
      );
    }
  }

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div
      aria-label={t('activityLog')}
      role="region"
      className="activity-log-card rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-6"
    >
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t('activityLog')}</h2>
        <span className="text-sm text-[var(--color-muted)]">
          {t('showing')} {sorted.length ? page * PAGE_SIZE + 1 : 0}-
          {Math.min((page + 1) * PAGE_SIZE, sorted.length)} {t('of')}{' '}
          {sorted.length}
        </span>
      </div>

      {/* Year tabs */}
      <div
        role="group"
        aria-label={locale === 'zh' ? '活动年份' : 'Activity year'}
        className="mb-3 flex flex-wrap items-center gap-2"
      >
        <button
          aria-pressed={year === null}
          onClick={() => {
            onSelectActivity?.(null);
            setYear(null);
            setPage(0);
          }}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${year === null ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
        >
          {t('all')}
        </button>
        {years.map((y) => (
          <button
            key={y}
            aria-pressed={year === y}
            onClick={() => {
              onSelectActivity?.(null);
              setYear(y);
              setPage(0);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${year === y ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Distance filter */}
      <div
        role="group"
        aria-label={locale === 'zh' ? '距离筛选' : 'Distance filter'}
        className="mb-5 flex items-center gap-2"
      >
        {(
          [
            ['all', t('all')],
            ...distanceOptions.map(
              (distance) =>
                [String(distance), `${distance}km+`] as [DistanceFilter, string]
            ),
          ] as [DistanceFilter, string][]
        ).map(([val, label]) => (
          <button
            key={val}
            aria-pressed={distFilter === val}
            onClick={() => {
              onSelectActivity?.(null);
              setDistFilter(val);
              setPage(0);
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${distFilter === val ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="table-scroll-hint mb-2 text-xs text-[var(--color-muted)]">
        {locale === 'zh'
          ? '左右滑动查看更多数据，点击记录查看路线'
          : 'Swipe for more details; select an activity to view its route'}
      </p>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
              <th className="pb-3 font-medium">{t('date')}</th>
              <th className="pb-3 font-medium">{t('type')}</th>
              <th className="pb-3 font-medium">{t('name')}</th>
              <th className="pb-3 font-medium">{t('distance')}</th>
              <th className="pb-3 font-medium">{t('duration')}</th>
              <th className="pb-3 font-medium">{performance.label}</th>
              <th className="pb-3 font-medium">{t('hr')}</th>
            </tr>
          </thead>
          <tbody>
            {!pageData.length && (
              <tr>
                <td
                  colSpan={7}
                  className="py-10 text-center text-[var(--color-muted)]"
                >
                  {locale === 'zh'
                    ? '没有符合筛选条件的活动'
                    : 'No activities match these filters'}
                </td>
              </tr>
            )}
            {pageData.map((a) => (
              <tr
                key={a.run_id}
                tabIndex={onSelectActivity ? 0 : undefined}
                aria-selected={selectedActivity?.run_id === a.run_id}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectActivity?.(
                      selectedActivity?.run_id === a.run_id ? null : a
                    );
                  }
                }}
                onClick={() =>
                  onSelectActivity?.(
                    selectedActivity?.run_id === a.run_id ? null : a
                  )
                }
                className={`cursor-pointer border-b border-[var(--color-border)]/30 transition-colors ${
                  selectedActivity?.run_id === a.run_id
                    ? 'border-l-2 border-l-[var(--color-accent)] bg-[var(--color-accent)]/10'
                    : 'hover:bg-[var(--color-bg)]'
                }`}
              >
                <td className="py-3 text-[var(--color-muted)]">
                  {a.start_date_local.slice(0, 16).replace('T', ' ')}
                </td>
                <td className="py-3">
                  <span className="text-[var(--color-muted)]">
                    {presentation.icon}{' '}
                    {getActivityTypeLabel(mode, a.type, locale)}
                  </span>
                </td>
                <td className="py-3">
                  {a.name || getActivityTypeLabel(mode, a.type, locale)}
                </td>
                <td className="py-3 font-mono font-medium">
                  {(a.distance / 1000).toFixed(1)}
                  <span className="ml-1 text-xs font-normal text-[var(--color-muted)]">
                    km
                  </span>
                </td>
                <td className="py-3 text-[var(--color-muted)]">
                  {formatDuration(a.moving_time)}
                </td>
                <td className="py-3 text-[var(--color-muted)]">
                  {
                    formatActivityPerformance(a.average_speed, mode, locale)
                      .display
                  }
                </td>
                <td className="py-3 text-[var(--color-muted)]">
                  {a.average_heartrate ? Math.round(a.average_heartrate) : '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
        <button
          aria-label={
            locale === 'zh' ? '上一页活动' : 'Previous activities page'
          }
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
        >
          ←
        </button>
        <span className="text-sm text-[var(--color-muted)]">
          {t('page')} {totalPages ? page + 1 : 0} {t('pageOf')} {totalPages}{' '}
          {t('pages')}
        </span>
        <button
          aria-label={locale === 'zh' ? '下一页活动' : 'Next activities page'}
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-text)] disabled:opacity-30"
        >
          →
        </button>
      </div>
    </div>
  );
}
