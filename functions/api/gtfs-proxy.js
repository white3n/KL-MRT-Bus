export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const targetUrl = url.searchParams.get('url') || '';
  const allowed =
    targetUrl.startsWith('https://api.data.gov.my/gtfs-static/') ||
    targetUrl.startsWith('https://api.data.gov.my/gtfs-realtime/') ||
    targetUrl.startsWith('https://photon.komoot.io/api/');

  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Invalid GTFS feed URL.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: { 'User-Agent': 'KLTransitLive/2.0 (+https://data.gov.my)' },
    });
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `Upstream HTTP ${upstream.status}` }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
        'Cache-Control': targetUrl.includes('gtfs-static')
          ? 'public, max-age=1800'
          : 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to fetch Malaysia GTFS data.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
