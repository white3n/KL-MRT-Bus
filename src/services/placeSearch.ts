import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { normalizeSearch } from '../utils/transitHelpers';

export interface KlPlaceResult {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lon: number;
  kind: 'place' | 'station' | 'bus-stop' | 'gps';
}

// Instant offline-ready popular KL destinations (malls, condos, landmarks)
const CURATED_KL_PLACES: KlPlaceResult[] = [
  { id: 'kl:pavilion', name: 'Pavilion Kuala Lumpur', subtitle: 'Bukit Bintang, Kuala Lumpur', lat: 3.14915, lon: 101.71295, kind: 'place' },
  { id: 'kl:klcc', name: 'Suria KLCC / Petronas Towers', subtitle: 'Kuala Lumpur City Centre', lat: 3.15785, lon: 101.71225, kind: 'place' },
  { id: 'kl:trx', name: 'The Exchange TRX', subtitle: 'Tun Razak Exchange, KL', lat: 3.1422, lon: 101.7186, kind: 'place' },
  { id: 'kl:aeon-maluri', name: 'AEON Taman Maluri', subtitle: 'Jalan Jejaka, Cheras', lat: 3.12582, lon: 101.72818, kind: 'place' },
  { id: 'kl:velocity', name: 'Sunway Velocity Mall', subtitle: 'Jalan Peel, Maluri, Cheras', lat: 3.12775, lon: 101.72525, kind: 'place' },
  { id: 'kl:mytown', name: 'MyTOWN / IKEA Cheras', subtitle: 'Jalan Cochrane, Cheras', lat: 3.1342, lon: 101.7224, kind: 'place' },
  { id: 'kl:mvertica', name: 'M Vertica Residences', subtitle: 'Jalan Cheras, Maluri', lat: 3.11905, lon: 101.72701, kind: 'place' },
  { id: 'kl:midvalley', name: 'Mid Valley Megamall', subtitle: 'Lingkaran Syed Putra, KL', lat: 3.11766, lon: 101.67737, kind: 'place' },
  { id: 'kl:lalaport', name: 'LaLaport BBCC', subtitle: 'Jalan Hang Tuah, Bukit Bintang', lat: 3.1401, lon: 101.7093, kind: 'place' },
  { id: 'kl:bts', name: 'Berjaya Times Square', subtitle: 'Jalan Imbi, Bukit Bintang', lat: 3.1422, lon: 101.7106, kind: 'place' },
  { id: 'kl:sunway', name: 'Sunway Pyramid', subtitle: 'Bandar Sunway, Subang Jaya', lat: 3.0731, lon: 101.6075, kind: 'place' },
  { id: 'kl:oneutama', name: '1 Utama Shopping Centre', subtitle: 'Bandar Utama, Petaling Jaya', lat: 3.1499, lon: 101.6157, kind: 'place' },
  { id: 'kl:petaling', name: 'Petaling Street (Chinatown)', subtitle: 'Pasar Seni, Kuala Lumpur', lat: 3.1441, lon: 101.6975, kind: 'place' },
  { id: 'kl:klsentral', name: 'NU Sentral / KL Sentral', subtitle: 'Brickfields, Kuala Lumpur', lat: 3.1338, lon: 101.6869, kind: 'place' },
  { id: 'kl:tbs', name: 'TBS (Terminal Bersepadu Selatan)', subtitle: 'Bandar Tasik Selatan, KL', lat: 3.0772, lon: 101.7115, kind: 'place' },
];

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    name?: string;
    street?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

export async function searchKlPlaces(
  query: string,
  nearLat = 3.1478,
  nearLon = 101.6953,
  limit = 6
): Promise<KlPlaceResult[]> {
  const q = query.trim();
  const norm = normalizeSearch(q);
  if (norm.length < 2) return [];

  // 1. Instant curated local matches first
  const localMatches = CURATED_KL_PLACES.filter(
    (p) => normalizeSearch(p.name).includes(norm) || normalizeSearch(p.subtitle).includes(norm)
  );

  // 2. Live Photon (OpenStreetMap) geocoding biased to Klang Valley / Kuala Lumpur
  const photonUrl =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}` +
    `&lat=${nearLat.toFixed(4)}&lon=${nearLon.toFixed(4)}&limit=${limit + 4}`;

  let remoteMatches: KlPlaceResult[] = [];
  try {
    let data: { features?: PhotonFeature[] } | null = null;
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({
        url: photonUrl,
        headers: { 'User-Agent': 'KLTransitLive/3.2' },
        connectTimeout: 6000,
        readTimeout: 6000,
      });
      if (res.status >= 200 && res.status < 300) {
        data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      }
    } else {
      const proxyUrl = `/api/gtfs-proxy?url=${encodeURIComponent(photonUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        data = (await res.json()) as { features?: PhotonFeature[] };
      }
    }

    if (data?.features?.length) {
      remoteMatches = data.features
        .filter((f) => {
          const coords = f.geometry?.coordinates;
          if (!coords || coords.length < 2) return false;
          const [lon, lat] = coords;
          // Keep results strictly inside Greater Kuala Lumpur / Klang Valley / Selangor
          return lat >= 2.6 && lat <= 3.6 && lon >= 101.1 && lon <= 102.1;
        })
        .map((f, idx) => {
          const [lon, lat] = f.geometry!.coordinates!;
          const p = f.properties || {};
          const name = p.name || p.street || q;
          const subParts = [p.street, p.district, p.city].filter(
            (x): x is string => Boolean(x) && x !== name
          );
          return {
            id: `photon:${p.osm_id || idx}:${lat.toFixed(4)}:${lon.toFixed(4)}`,
            name,
            subtitle: subParts.slice(0, 2).join(', ') || 'Kuala Lumpur',
            lat,
            lon,
            kind: 'place' as const,
          };
        });
    }
  } catch {
    // Graceful offline fallback to local curated KL landmarks
  }

  // Merge & deduplicate by normalized name + proximity
  const merged: KlPlaceResult[] = [];
  const seen = new Set<string>();
  for (const item of [...localMatches, ...remoteMatches]) {
    const key = `${normalizeSearch(item.name)}:${item.lat.toFixed(2)}:${item.lon.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}
