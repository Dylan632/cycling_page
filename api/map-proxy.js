const MAP_HOSTNAMES = new Set([
  'basemaps.cartocdn.com',
  'tiles.basemaps.cartocdn.com',
  'tiles-a.basemaps.cartocdn.com',
  'tiles-b.basemaps.cartocdn.com',
  'tiles-c.basemaps.cartocdn.com',
  'tiles-d.basemaps.cartocdn.com',
  'a.basemaps.cartocdn.com',
  'b.basemaps.cartocdn.com',
  'c.basemaps.cartocdn.com',
  'd.basemaps.cartocdn.com',
  'tiles.openfreemap.org',
]);

const getTargetUrl = (value) => {
  if (typeof value !== 'string' || value.length === 0) return null;

  try {
    const target = new URL(value);
    if (target.protocol !== 'https:') return null;
    if (!MAP_HOSTNAMES.has(target.hostname)) return null;
    return target;
  } catch {
    return null;
  }
};

export default async function handler(request, response) {
  const target = getTargetUrl(request.query?.url);
  if (!target) {
    response.statusCode = 400;
    response.end('Invalid map resource URL');
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, HEAD');
    response.end('Method not allowed');
    return;
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        accept: request.headers.accept ?? '*/*',
        'user-agent':
          'running-page-map-proxy/1.0 (+https://github.com/Dylan632/cycling_page)',
      },
    });

    response.statusCode = upstream.status;
    response.setHeader(
      'cache-control',
      'public, s-maxage=86400, stale-while-revalidate=604800'
    );
    response.setHeader('access-control-allow-origin', '*');

    for (const headerName of ['content-type', 'etag', 'last-modified']) {
      const value = upstream.headers.get(headerName);
      if (value) response.setHeader(headerName, value);
    }

    if (request.method === 'HEAD' || !upstream.body) {
      response.end();
      return;
    }

    response.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    console.error('Map resource proxy failed', error);
    response.statusCode = 502;
    response.end('Map resource unavailable');
  }
}
