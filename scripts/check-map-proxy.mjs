#!/usr/bin/env node

import process from 'node:process';

const origin = process.argv[2];
if (!origin) throw new Error('A deployment origin is required');

const headers = {
  'user-agent': 'cycling-page-map-proxy-check/1',
  ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? {
        'x-vercel-protection-bypass':
          process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      }
    : {}),
};

const fetchThroughProxy = async (resourceUrl) => {
  const target = new URL('/api/map-proxy', origin);
  target.searchParams.set('url', resourceUrl);
  const response = await fetch(target, { headers });
  const contentType = response.headers.get('content-type') ?? '';
  return { response, contentType };
};

const styleUrl = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';
const { response: styleResponse, contentType: styleContentType } =
  await fetchThroughProxy(styleUrl);
const styleBody = await styleResponse.text();
if (!styleResponse.ok) {
  throw new Error(
    `map proxy returned HTTP ${styleResponse.status} (${styleContentType}) for ${styleUrl}: ${styleBody.slice(0, 180)}`
  );
}
if (!styleContentType.toLowerCase().includes('application/json')) {
  throw new Error(
    `map proxy returned ${styleContentType || 'no content type'} instead of JSON`
  );
}

const style = JSON.parse(styleBody);

// Carto serves the same basemap style in more than one source shape: older
// documents point at a TileJSON URL (sources.<name>.url), newer ones inline the
// tile template (sources.<name>.tiles). Accept either, but prove the source
// really is Carto streets data behind a host the proxy is allowed to fetch.
const proxiedHostnames = new Set([
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
]);

const isProxiedCartoStreetsUrl = (value) => {
  if (typeof value !== 'string') return false;
  if (!value.includes('carto.streets')) return false;
  try {
    return proxiedHostnames.has(new URL(value).hostname);
  } catch {
    return false;
  }
};

const cartoSourceUrls = Object.values(style?.sources ?? {}).flatMap(
  (source) => [
    ...(typeof source?.url === 'string' ? [source.url] : []),
    ...(Array.isArray(source?.tiles)
      ? source.tiles.filter((tile) => typeof tile === 'string')
      : []),
  ]
);

if (style?.version !== 8 || !cartoSourceUrls.some(isProxiedCartoStreetsUrl)) {
  throw new Error('map proxy returned an unexpected Carto style document');
}

// The style's own tile template is the URL the map really requests, so probe it
// too: a wrong tile host answers 404 for every tile and leaves the map blank
// while the style check still passes.
const vectorTileTemplate = cartoSourceUrls.find(
  (url) => isProxiedCartoStreetsUrl(url) && url.includes('{z}')
);
if (vectorTileTemplate) {
  const vectorTileUrl = vectorTileTemplate
    .replace('{z}', '10')
    .replace('{x}', '857')
    .replace('{y}', '418');
  if (!vectorTileUrl.includes('{')) {
    const { response: vectorResponse, contentType: vectorContentType } =
      await fetchThroughProxy(vectorTileUrl);
    const vectorBody = Buffer.from(await vectorResponse.arrayBuffer());
    if (!vectorResponse.ok) {
      throw new Error(
        `map proxy returned HTTP ${vectorResponse.status} for the basemap vector tile ${vectorTileUrl}`
      );
    }
    if (vectorBody.length === 0) {
      throw new Error(`map proxy returned an empty basemap vector tile`);
    }
    process.stdout.write(
      `map proxy passed: vector tile HTTP ${vectorResponse.status}, ${vectorContentType}, ${vectorBody.length} bytes\n`
    );
  }
}

// Raster basemap tiles stay on the proxy allowlist, so keep probing them: a
// wrong raster host answers 404 for every tile while the style check passes.
for (const theme of ['dark_all', 'light_all']) {
  const tileUrl = `https://a.basemaps.cartocdn.com/${theme}/10/857/418.png`;
  const { response: tileResponse, contentType: tileContentType } =
    await fetchThroughProxy(tileUrl);
  const tileBody = Buffer.from(await tileResponse.arrayBuffer());
  if (!tileResponse.ok) {
    throw new Error(
      `map proxy returned HTTP ${tileResponse.status} for the ${theme} basemap tile ${tileUrl}`
    );
  }
  if (!tileContentType.toLowerCase().includes('image/')) {
    throw new Error(
      `map proxy returned ${tileContentType || 'no content type'} instead of an image for ${tileUrl}`
    );
  }
  if (tileBody.length === 0) {
    throw new Error(`map proxy returned an empty ${theme} basemap tile`);
  }
  process.stdout.write(
    `map proxy passed: ${theme} tile HTTP ${tileResponse.status}, ${tileContentType}, ${tileBody.length} bytes\n`
  );
}

process.stdout.write(
  `map proxy passed: style HTTP ${styleResponse.status}, ${styleContentType}, ${styleBody.length} bytes\n`
);
