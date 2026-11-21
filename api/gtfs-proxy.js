export default async function handler(req, res) {
  const targetUrl = typeof req.query?.url === 'string' ? req.query.url : '';
  const allowed =
    targetUrl.startsWith('https://api.data.gov.my/gtfs-static/') ||
    targetUrl.startsWith('https://api.data.gov.my/gtfs-realtime/');

  if (!allowed) {
    res.status(400).json({ error: 'Invalid GTFS feed URL.' });
    return;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: { 'User-Agent': 'KLTransitLive/2.0 (+https://data.gov.my)' },
    });
    if (!upstream.ok) {
      const retryAfter = upstream.headers.get('retry-after');
      if (retryAfter) res.setHeader('Retry-After', retryAfter);
      const errBody = await upstream.text().catch(() => '');
      res.status(upstream.status).send(errBody || JSON.stringify({ error: `Upstream HTTP ${upstream.status}` }));
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader(
      'Content-Type',
      upstream.headers.get('content-type') || 'application/octet-stream'
    );
    res.setHeader(
      'Cache-Control',
      targetUrl.includes('gtfs-static') ? 'public, s-maxage=3600, max-age=1800' : 'no-store'
    );
    res.status(200).send(buf);
  } catch {
    res.status(502).json({ error: 'Failed to fetch Malaysia GTFS data.' });
  }
}
