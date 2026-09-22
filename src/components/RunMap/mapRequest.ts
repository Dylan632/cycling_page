const MAP_PROXY_HOSTS = {
  'basemaps.cartocdn.com': '/map-proxy/style',
  'tiles.basemaps.cartocdn.com': '/map-proxy/tiles',
  'tiles-a.basemaps.cartocdn.com': '/map-proxy/tiles',
  'tiles-b.basemaps.cartocdn.com': '/map-proxy/tiles',
  'tiles-c.basemaps.cartocdn.com': '/map-proxy/tiles',
  'tiles-d.basemaps.cartocdn.com': '/map-proxy/tiles',
  'a.basemaps.cartocdn.com': '/map-proxy/tiles',
  'b.basemaps.cartocdn.com': '/map-proxy/tiles',
  'c.basemaps.cartocdn.com': '/map-proxy/tiles',
  'd.basemaps.cartocdn.com': '/map-proxy/tiles',
  'tiles.openfreemap.org': '/map-proxy/openfreemap',
} as const;

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Build a same-origin URL for an allowlisted map resource. The Vercel
 * Function receives the encoded target and fetches it server-side, so the
 * browser does not need direct access to the upstream tile provider.
 */
export const getCartoProxyUrl = (
  requestUrl: string,
  origin: string
): string | null => {
  try {
    const target = new URL(requestUrl);
    const proxyPath =
      MAP_PROXY_HOSTS[target.hostname as keyof typeof MAP_PROXY_HOSTS];
    if (target.protocol !== 'https:' || !proxyPath) return null;

    const proxyUrl = new URL('/api/map-proxy', origin);
    proxyUrl.searchParams.set('url', requestUrl);
    return proxyUrl.toString();
  } catch {
    return null;
  }
};

/**
 * Keep local development and browser tests direct, but proxy supported map
 * resources from deployed pages so the browser never has to reach the
 * upstream tile provider itself.
 */
export const transformCartoRequest = (requestUrl: string): { url: string } => {
  if (typeof window === 'undefined') return { url: requestUrl };
  if (LOCAL_HOSTNAMES.has(window.location.hostname)) return { url: requestUrl };

  return {
    url: getCartoProxyUrl(requestUrl, window.location.origin) ?? requestUrl,
  };
};
