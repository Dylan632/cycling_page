import { useMemo } from 'react';
import type { Activity } from '@/utils/utils';
import { locationForRun, titleForRun } from '@/utils/utils';
import { COUNTRY_STANDARDIZATION } from '@/static/city';
import { useActivityMode } from '@/modules/activity/ActivityModeProvider';
import { activityDataRepository } from '@/modules/activity/activityData';
import type { ActivityMode } from '@/modules/activity/profiles';

interface ProcessedActivities {
  activities: Activity[];
  years: string[];
  countries: string[];
  provinces: string[];
  cities: Record<string, number>;
  runPeriod: Record<string, number>;
  thisYear: string;
}

const standardizeCountryName = (country: string): string => {
  for (const [pattern, standardName] of COUNTRY_STANDARDIZATION) {
    if (country.includes(pattern)) {
      return standardName;
    }
  }
  return country;
};

interface SuspenseResource<Result> {
  preload: () => Promise<void>;
  read: () => Result;
  rejected: () => boolean;
}

const activityResources = new Map<string, SuspenseResource<Activity[]>>();

const createResource = <Result>(
  loader: () => Promise<Result>
): SuspenseResource<Result> => {
  let status: 'pending' | 'resolved' | 'rejected' = 'pending';
  let result: Result;
  let failure: unknown;
  const promise = loader().then(
    (value) => {
      status = 'resolved';
      result = value;
    },
    (error: unknown) => {
      status = 'rejected';
      failure = error;
    }
  );

  return {
    preload: () => promise,
    rejected: () => status === 'rejected',
    read: () => {
      if (status === 'pending') throw promise;
      if (status === 'rejected') throw failure;
      return result;
    },
  };
};

const activityResourceKey = (mode: ActivityMode, years: string[] | null) =>
  years ? `${mode}:${years.join(',')}` : `${mode}:metadata`;

/**
 * Drops a cached resource, but only if it is still the one that failed. A
 * newer resource for the same key belongs to a later request and must survive.
 */
const forgetActivityResource = (
  mode: ActivityMode,
  years: string[] | null,
  resource: SuspenseResource<Activity[]>
) => {
  const key = activityResourceKey(mode, years);
  if (activityResources.get(key) === resource) activityResources.delete(key);
};

const getActivityResource = (
  mode: ActivityMode,
  years: string[] | null
): SuspenseResource<Activity[]> => {
  const key = activityResourceKey(mode, years);
  let resource = activityResources.get(key);
  if (!resource) {
    resource = createResource(() =>
      years
        ? activityDataRepository.loadActivities(mode, years)
        : activityDataRepository.loadMetadata(mode)
    );
    activityResources.set(key, resource);
  }
  return resource;
};

const processActivities = (activityData: Activity[]): ProcessedActivities => {
  const cities: Record<string, number> = {};
  const runPeriod: Record<string, number> = {};
  const provinces: Set<string> = new Set();
  const countries: Set<string> = new Set();
  const years: Set<string> = new Set();

  activityData.forEach((run) => {
    const location = locationForRun(run);

    const periodName = titleForRun(run);
    if (periodName) {
      runPeriod[periodName] = runPeriod[periodName]
        ? runPeriod[periodName] + 1
        : 1;
    }

    const { city, province, country } = location;
    // drop only one char city
    if (city.length > 1) {
      cities[city] = cities[city] ? cities[city] + run.distance : run.distance;
    }
    if (province) provinces.add(province);
    if (country) countries.add(standardizeCountryName(country));
    const year = run.start_date_local.slice(0, 4);
    years.add(year);
  });

  const yearsArray = [...years].sort().reverse();
  const thisYear = yearsArray[0] || '';

  return {
    activities: activityData,
    years: yearsArray,
    countries: [...countries],
    provinces: [...provinces],
    cities,
    runPeriod,
    thisYear,
  };
};

let processedActivitiesCache: {
  activityData: Activity[];
  processedActivities: ProcessedActivities;
} | null = null;

const getProcessedActivities = (activityData: Activity[]) => {
  if (processedActivitiesCache?.activityData === activityData) {
    return processedActivitiesCache.processedActivities;
  }

  const processedActivities = processActivities(activityData);
  processedActivitiesCache = { activityData, processedActivities };
  return processedActivities;
};

const useActivities = () => {
  const { mode } = useActivityMode();
  const activityData = getActivityResource(mode, null).read();
  return useMemo(() => getProcessedActivities(activityData), [activityData]);
};

export const useActivitiesWithRoutes = (scope: string) => {
  const { mode } = useActivityMode();
  const processed = useActivities();
  const years =
    scope === 'Total'
      ? processed.years
      : [scope || processed.thisYear].filter(Boolean);
  const routedActivities = getActivityResource(mode, years).read();
  return useMemo(
    () => ({ ...processed, activities: routedActivities }),
    [processed, routedActivities]
  );
};

export const preloadActivitiesWithRoutes = (
  mode: ActivityMode,
  years: string[]
): Promise<void> => getActivityResource(mode, years).preload();

/**
 * Warms a mode's data before the user commits to it.
 *
 * The resource cache keeps a rejection for the lifetime of the page, so a
 * speculative preload must clear its own failures: otherwise a hover that
 * timed out would make the later click fail too, on a connection that has
 * since recovered. Reading a rejected resource throws, so this never calls
 * read() without checking first, and it resolves even when the warm-up fails.
 */
export const preloadActivityMode = async (
  mode: ActivityMode
): Promise<void> => {
  const metadataResource = getActivityResource(mode, null);
  await metadataResource.preload();
  if (metadataResource.rejected()) {
    forgetActivityResource(mode, null, metadataResource);
    return;
  }

  const years = getProcessedActivities(metadataResource.read()).years;
  const routesResource = getActivityResource(mode, years);
  await routesResource.preload();
  if (routesResource.rejected()) {
    forgetActivityResource(mode, years, routesResource);
  }
};

export const loadActivitiesWithRoutes = async (
  mode: ActivityMode,
  years: string[]
): Promise<Activity[]> => {
  const resource = getActivityResource(mode, years);
  await resource.preload();
  return resource.read();
};

export const resetActivityData = () => {
  activityResources.clear();
  processedActivitiesCache = null;
  activityDataRepository.clear();
};

export default useActivities;
