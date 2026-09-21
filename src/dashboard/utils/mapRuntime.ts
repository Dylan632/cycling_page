export interface MapRuntimeErrorLike {
  message?: string;
  name?: string;
  status?: number;
  url?: string;
}

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
    /(?:tiles-[a-d]\.basemaps\.cartocdn\.com|\/api\/map-proxy)/i.test(
      details
    ) &&
    /(?:dark_all|light_all|\.png(?:\b|[?#]))/i.test(details);

  if (!isRasterTileRequest) return false;

  return (
    error.status === 404 ||
    /\b404\b/.test(details) ||
    /(?:failed to fetch|failed to load|networkerror)/i.test(details)
  );
};
