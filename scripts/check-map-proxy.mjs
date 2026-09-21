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
if (
  style?.version !== 8 ||
  typeof style?.sources?.carto?.url !== 'string' ||
  !style.sources.carto.url.includes('carto.streets')
) {
  throw new Error('map proxy returned an unexpected Carto style document');
}

// The dashboard basemap is raster, so probe a real tile too: a wrong tile host
// answers 404 for every tile and leaves the map blank while the style check
// still passes.
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
