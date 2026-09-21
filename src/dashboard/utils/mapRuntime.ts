export interface MapRuntimeErrorLike {
  message?: string;
  name?: string;
  status?: number;
  url?: string;
}

/**
 * Carto publishes the raster basemaps (`dark_all`, `light_all`) on these shard
 * hosts. The similarly named `tiles-*.basemaps.cartocdn.com` hosts only answer
 * for vector tiles, so asking them for a PNG returns 404 for every tile and
 * leaves the map blank.
 */
export const CARTO_RASTER_TILE_HOSTS = [
  'a.basemaps.cartocdn.com',
  'b.basemaps.cartocdn.com',
  'c.basemaps.cartocdn.com',
  'd.basemaps.cartocdn.com',
] as const;

const CARTO_RASTER_HOST_PATTERN =
  /(?:\b[a-d]\.basemaps\.cartocdn\.com|tiles-[a-d]\.basemaps\.cartocdn\.com|\/api\/map-proxy)/i;

export const isRecoverableCartoMapError = (
  error: MapRuntimeErrorLike
): boolean => {
  const details = [error.name, error.message, error.url]
    .filter(Boolean)
    .join(' ');

  if (/\b(?:abort(?:ed)?|cancel(?:led|ed)?)\b/i.test(details)) {
    return true;
  }

  const isRasterTileRequest =
    CARTO_RASTER_HOST_PATTERN.test(details) &&
    /(?:dark_all|light_all|\.png(?:\b|[?#]))/i.test(details);

  if (!isRasterTileRequest) return false;

  return (
    error.status === 404 ||
    /\b404\b/.test(details) ||
    /(?:failed to fetch|failed to load|networkerror)/i.test(details)
  );
};
