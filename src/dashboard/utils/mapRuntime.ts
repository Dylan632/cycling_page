export interface MapRuntimeErrorLike {
  message?: string;
  name?: string;
  status?: number;
  url?: string;
}

/**
 * MapLibre aborts obsolete tile and glyph requests whenever the camera moves
 * or the style is replaced. Those cancellations are routine, not failures.
 */
export const isCancelledMapRequest = (error: MapRuntimeErrorLike): boolean => {
  // A DOMException carries the reason in `name` alone, and `\babort\b` does not
  // match inside "AbortError" — there is no word boundary before "Error".
  if (/^(?:abort|cancel)/i.test(error.name ?? '')) return true;
  return /\b(?:abort(?:ed)?|cancel(?:led|ed)?)\b/i.test(
    [error.message, error.url].filter(Boolean).join(' ')
  );
};

/** Failures tolerated after the style loads before the basemap is called down. */
export const TRANSIENT_BASEMAP_ERROR_LIMIT = 12;

export type BasemapStatus = 'ready' | 'error';

/**
 * Turns MapLibre's error and idle events into a basemap status.
 *
 * A failure has to latch. MapLibre counts a tile that failed to load as loaded
 * and still reaches idle, so treating idle as proof of health would clear the
 * error — and the retry control with it — for a provider that is unreachable.
 */
export const createBasemapStatusTracker = (
  transientErrorLimit: number = TRANSIENT_BASEMAP_ERROR_LIMIT
) => {
  let failed = false;
  let transientErrors = 0;

  return {
    /** The status this error should apply, or null to ignore it. */
    error(
      error: MapRuntimeErrorLike,
      styleReady: boolean
    ): BasemapStatus | null {
      if (isCancelledMapRequest(error)) return null;
      if (styleReady) {
        transientErrors += 1;
        if (transientErrors < transientErrorLimit) return null;
      }
      failed = true;
      return 'error';
    },

    /** The status this idle event should apply, or null to ignore it. */
    idle(styleReady: boolean): BasemapStatus | null {
      if (!styleReady || failed) return null;
      transientErrors = 0;
      return 'ready';
    },
  };
};
