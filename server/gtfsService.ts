import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import type {
  BusCategory,
  BusRouteDetailPayload,
  BusRouteSummary,
  BusStopPoint,
  DirectionDepartures,
  InterchangeRef,
  LiveBusesPayload,
  LiveBusVehicle,
  NearbyBusStop,
  NearbyRailStation,
  NearbyTransitPayload,
  RailCategory,
  RailLine,
  RailNetworkPayload,
  RailStation,
  StationDeparturePayload,
  UpcomingTrain,
} from '../src/types/transit.ts';

const API_BASE = 'https://api.data.gov.my';
const STATIC_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REALTIME_CACHE_TTL_MS = 2000; // 2 seconds staggered real-time updates

class RateLimitError extends Error {
  public readonly retryAfterSec: number;
  constructor(retryAfterSec: number, url: string) {
    super(`HTTP 429 throttled (${retryAfterSec}s) fetching ${url}`);
    this.retryAfterSec = retryAfterSec;
  }
}

function parseThrottleSeconds(bodyText: string, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const parsed = Number.parseInt(retryAfterHeader, 10);
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(30, parsed);
  }
  const m = bodyText.match(/(\d+)\s*second/i);
  if (m) {
    const sec = Number.parseInt(m[1], 10);
    if (Number.isFinite(sec) && sec > 0) return Math.min(30, sec);
  }
  return 6;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Official high-contrast color overrides where raw GTFS hex is hard to read on light UI
const RAIL_COLOR_MAP: Record<string, { color: string; textColor: string }> = {
  AG: { color: '#EA580C', textColor: '#FFFFFF' }, // Ampang LRT - Orange
  PH: { color: '#9F1239', textColor: '#FFFFFF' }, // Sri Petaling LRT - Deep Maroon
  KJ: { color: '#E11D48', textColor: '#FFFFFF' }, // Kelana Jaya LRT - Ruby Red
  KGL: { color: '#047857', textColor: '#FFFFFF' }, // Kajang MRT - Emerald Green
  PYL: { color: '#CA8A04', textColor: '#FFFFFF' }, // Putrajaya MRT - Gold/Yellow (legible)
  MR: { color: '#65A30D', textColor: '#FFFFFF' }, // KL Monorail - Lime Green
  BRT: { color: '#15803D', textColor: '#FFFFFF' }, // BRT Sunway - Forest Green
  SA: { color: '#9333EA', textColor: '#FFFFFF' }, // Shah Alam LRT3 - Purple
};

interface RawCsvRow {
  [key: string]: string;
}

interface RailStopTime {
  tripId: string;
  stopId: string;
  arrivalSec: number;
  departureSec: number;
  sequence: number;
}

interface RailFrequency {
  tripId: string;
  startSec: number;
  endSec: number;
  headwaySec: number;
}

interface RailTrip {
  routeId: string;
  serviceId: string;
  tripId: string;
  headsign: string;
  directionId: string;
  shapeId: string;
}

interface RailCalendarRule {
  serviceId: string;
  days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean]; // Mon..Sun
  startDate: string;
  endDate: string;
}

interface RailStaticStore {
  lines: RailLine[];
  stations: RailStation[];
  stationsById: Map<string, RailStation>;
  calendarByServiceId: Map<string, RailCalendarRule>;
  tripsById: Map<string, RailTrip>;
  tripsByRoute: Map<string, RailTrip[]>;
  stopTimesByTrip: Map<string, RailStopTime[]>;
  frequenciesByTrip: Map<string, RailFrequency[]>;
  loadedAt: number;
}

interface BusRouteInternal {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  category: BusCategory;
  color: string;
  sampleTripId?: string;
  sampleShapeId?: string;
}

interface BusTripInternal {
  tripId: string;
  routeId: string;
  headsign: string;
  shapeId: string;
}

interface BusStopInternal {
  stopId: string;
  stopCode: string;
  stopName: string;
  lat: number;
  lon: number;
}

interface BusCategoryStaticStore {
  category: BusCategory;
  routesById: Map<string, BusRouteInternal>;
  routesByCode: Map<string, BusRouteInternal>;
  tripsById: Map<string, BusTripInternal>;
  stopsById: Map<string, BusStopInternal>;
  // Stored compactly for route detail requests
  zipBuffer: Buffer;
  loadedAt: number;
}

interface BusRealtimeCache {
  vehicles: LiveBusVehicle[];
  fetchedAt: number;
  staleWarning?: string;
}

function parseCsv(text: string): RawCsvRow[] {
  if (!text || !text.trim()) return [];
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
  }) as RawCsvRow[];
}

function readZipEntryText(zip: AdmZip, filename: string): string {
  const entry = zip.getEntry(filename);
  if (!entry) return '';
  return entry.getData().toString('utf8');
}

function parseGtfsTime(timeStr: string): number {
  const parts = (timeStr || '').trim().split(':');
  if (parts.length < 2) return 0;
  const h = Number.parseInt(parts[0], 10) || 0;
  const m = Number.parseInt(parts[1], 10) || 0;
  const s = Number.parseInt(parts[2] || '0', 10) || 0;
  return h * 3600 + m * 60 + s;
}

function formatSecToHHMM(sec: number): string {
  const normalized = ((sec % 86400) + 86400) % 86400;
  const h = Math.floor(normalized / 3600);
  const m = Math.floor((normalized % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function titleCaseStation(raw: string): string {
  if (!raw) return '';
  const keepUpper = new Set([
    'KL',
    'KLCC',
    'TRX',
    'MRT',
    'LRT',
    'BRT',
    'KTM',
    'USJ',
    'SS',
    'SS15',
    'SS18',
    'UOB',
    'PWTC',
    'IOI',
    'UKM',
    'UPM',
    'TUDM',
    'KLIA',
    'II',
    'III',
  ]);
  return raw
    .split(/\s+/)
    .map((word) => {
      const clean = word.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (keepUpper.has(clean)) return word.toUpperCase();
      if (/^[A-Z]{2,3}\d+$/.test(clean)) return word.toUpperCase();
      if (word.includes('-')) {
        return word
          .split('-')
          .map((part) => {
            const pClean = part.toUpperCase();
            if (keepUpper.has(pClean)) return pClean;
            return part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : '';
          })
          .join('-');
      }
      return word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : '';
    })
    .join(' ');
}

function normalizeStationKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(LRT|MRT|BRT|MRL|STESEN|STATION|MONORAIL)\b/g, '')
    .replace(/\s*-\s*UOB|\s*-\s*.*$/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function downsampleCoords(points: [number, number][], maxPoints = 220): [number, number][] {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  const result: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(points.length - 1, Math.round(i * step));
    result.push(points[idx]);
  }
  return result;
}

export function getMalaysiaNow(): {
  secondsSinceMidnight: number;
  timeStr: string;
  dateStr: string;
  yyyymmdd: string;
  weekdayIndex: number;
  dayType: 'MonFri' | 'Sat' | 'Sun';
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  const hour = Number.parseInt(get('hour'), 10) % 24;
  const minute = Number.parseInt(get('minute'), 10);
  const second = Number.parseInt(get('second'), 10);
  const weekday = get('weekday');
  const wdMap: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const weekdayIndex = wdMap[weekday] ?? 0;
  let dayType: 'MonFri' | 'Sat' | 'Sun' = 'MonFri';
  if (weekday === 'Sat') dayType = 'Sat';
  else if (weekday === 'Sun') dayType = 'Sun';

  return {
    secondsSinceMidnight: hour * 3600 + minute * 60 + second,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`,
    dateStr: `${get('day')}/${get('month')}/${get('year')}`,
    yyyymmdd: `${get('year')}${get('month')}${get('day')}`,
    weekdayIndex,
    dayType,
  };
}

function resolveActiveServiceIds(
  calendarByServiceId: Map<string, RailCalendarRule>,
  weekdayIndex: number,
  yyyymmdd: string,
  fallbackDayType: 'MonFri' | 'Sat' | 'Sun'
): Set<string> {
  const activeWithDate = new Set<string>();
  const activeByDayOnly = new Set<string>();

  for (const rule of calendarByServiceId.values()) {
    if (!rule.days[weekdayIndex]) continue;
    activeByDayOnly.add(rule.serviceId);
    const afterStart = !rule.startDate || yyyymmdd >= rule.startDate;
    const beforeEnd = !rule.endDate || yyyymmdd <= rule.endDate;
    if (afterStart && beforeEnd) {
      activeWithDate.add(rule.serviceId);
    }
  }

  if (activeWithDate.size > 0) return activeWithDate;
  if (activeByDayOnly.size > 0) return activeByDayOnly;
  return new Set([fallbackDayType]);
}

function parseDestinationFromHeadsign(headsign: string): { origin: string; destination: string } {
  const match = headsign.match(/From\s+(.+?)\s+to\s+(.+)/i);
  if (match) {
    return {
      origin: match[1].trim(),
      destination: match[2].trim(),
    };
  }
  return {
    origin: '',
    destination: headsign || 'Terminus',
  };
}

async function fetchWithTimeout(url: string, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'KLTransitLive/1.0 (+https://data.gov.my)',
      },
    });
    if (res.status === 429) {
      const txt = await res.text().catch(() => '');
      throw new RateLimitError(parseThrottleSeconds(txt, res.headers.get('retry-after')), url);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

class GtfsService {
  private railStore: RailStaticStore | null = null;
  private railLoadingPromise: Promise<RailStaticStore> | null = null;

  private busStaticStores: Map<BusCategory, BusCategoryStaticStore> = new Map();
  private busStaticLoadingPromise: Promise<void> | null = null;

  private busCategoryCache: Map<
    BusCategory,
    { vehicles: LiveBusVehicle[]; fetchedAt: number }
  > = new Map();
  private busRealtimeCache: BusRealtimeCache | null = null;
  private busRealtimePromise: Promise<BusRealtimeCache> | null = null;
  private nextPollCategoryIndex = 0;
  private throttleUntilMs = 0;

  private busRouteShapeCache: Map<string, { shapePoints: [number, number][]; stops: BusStopPoint[] }> =
    new Map();

  public warmup(): void {
    // Non-blocking staggered warmup on server startup to avoid api.data.gov.my burst 429
    this.ensureRailLoaded()
      .then(() => sleepMs(1500))
      .then(() => this.ensureBusStaticLoaded())
      .catch((err) => {
        console.error('[GTFS] Warmup error:', err.message);
      });
  }

  public async ensureRailLoaded(force = false): Promise<RailStaticStore> {
    if (
      !force &&
      this.railStore &&
      Date.now() - this.railStore.loadedAt < STATIC_CACHE_TTL_MS
    ) {
      return this.railStore;
    }
    if (this.railLoadingPromise) return this.railLoadingPromise;

    this.railLoadingPromise = this.loadRailStatic()
      .then((store) => {
        this.railStore = store;
        return store;
      })
      .finally(() => {
        this.railLoadingPromise = null;
      });

    return this.railLoadingPromise;
  }

  private async loadRailStatic(): Promise<RailStaticStore> {
    const url = `${API_BASE}/gtfs-static/prasarana?category=rapid-rail-kl`;
    const res = await fetchWithTimeout(url, 25000);
    const buffer = Buffer.from(await res.arrayBuffer());
    const zip = new AdmZip(buffer);

    const routesRows = parseCsv(readZipEntryText(zip, 'routes.txt'));
    const stopsRows = parseCsv(readZipEntryText(zip, 'stops.txt'));
    const calendarRows = parseCsv(readZipEntryText(zip, 'calendar.txt'));
    const tripsRows = parseCsv(readZipEntryText(zip, 'trips.txt'));
    const stopTimesRows = parseCsv(readZipEntryText(zip, 'stop_times.txt'));
    const frequenciesRows = parseCsv(readZipEntryText(zip, 'frequencies.txt'));
    const shapesRows = parseCsv(readZipEntryText(zip, 'shapes.txt'));

    // 0. Parse calendar.txt rules (Weekday / Saturday / Sunday)
    const calendarByServiceId = new Map<string, RailCalendarRule>();
    for (const row of calendarRows) {
      const sid = (row.service_id || '').trim();
      if (!sid) continue;
      calendarByServiceId.set(sid, {
        serviceId: sid,
        days: [
          row.monday === '1',
          row.tuesday === '1',
          row.wednesday === '1',
          row.thursday === '1',
          row.friday === '1',
          row.saturday === '1',
          row.sunday === '1',
        ],
        startDate: (row.start_date || '').trim(),
        endDate: (row.end_date || '').trim(),
      });
    }

    // 1. Parse shapes grouped by shape_id
    const shapesById = new Map<string, { seq: number; lat: number; lon: number }[]>();
    for (const row of shapesRows) {
      const id = row.shape_id;
      const lat = Number.parseFloat(row.shape_pt_lat);
      const lon = Number.parseFloat(row.shape_pt_lon);
      const seq = Number.parseInt(row.shape_pt_sequence, 10) || 0;
      if (!id || Number.isNaN(lat) || Number.isNaN(lon)) continue;
      let list = shapesById.get(id);
      if (!list) {
        list = [];
        shapesById.set(id, list);
      }
      list.push({ seq, lat, lon });
    }
    for (const list of shapesById.values()) {
      list.sort((a, b) => a.seq - b.seq);
    }

    // 2. Parse trips
    const tripsById = new Map<string, RailTrip>();
    const tripsByRoute = new Map<string, RailTrip[]>();
    for (const row of tripsRows) {
      const trip: RailTrip = {
        routeId: row.route_id,
        serviceId: row.service_id,
        tripId: row.trip_id,
        headsign: row.trip_headsign || '',
        directionId: row.direction_id || '0',
        shapeId: row.shape_id || '',
      };
      tripsById.set(trip.tripId, trip);
      const list = tripsByRoute.get(trip.routeId) || [];
      list.push(trip);
      tripsByRoute.set(trip.routeId, list);
    }

    // 3. Parse stop_times grouped by trip_id
    const stopTimesByTrip = new Map<string, RailStopTime[]>();
    for (const row of stopTimesRows) {
      const st: RailStopTime = {
        tripId: row.trip_id,
        stopId: row.stop_id,
        arrivalSec: parseGtfsTime(row.arrival_time),
        departureSec: parseGtfsTime(row.departure_time),
        sequence: Number.parseInt(row.stop_sequence, 10) || 0,
      };
      let list = stopTimesByTrip.get(st.tripId);
      if (!list) {
        list = [];
        stopTimesByTrip.set(st.tripId, list);
      }
      list.push(st);
    }
    for (const list of stopTimesByTrip.values()) {
      list.sort((a, b) => a.sequence - b.sequence);
    }

    // 4. Parse frequencies grouped by trip_id
    const frequenciesByTrip = new Map<string, RailFrequency[]>();
    for (const row of frequenciesRows) {
      const freq: RailFrequency = {
        tripId: row.trip_id,
        startSec: parseGtfsTime(row.start_time),
        endSec: parseGtfsTime(row.end_time),
        headwaySec: Number.parseInt(row.headway_secs, 10) || 300,
      };
      let list = frequenciesByTrip.get(freq.tripId);
      if (!list) {
        list = [];
        frequenciesByTrip.set(freq.tripId, list);
      }
      list.push(freq);
    }
    for (const list of frequenciesByTrip.values()) {
      list.sort((a, b) => a.startSec - b.startSec);
    }

    // 5. Build RailLines
    const routeMetaById = new Map<
      string,
      {
        shortName: string;
        longName: string;
        desc: string;
        category: RailCategory;
        color: string;
        textColor: string;
      }
    >();

    const lines: RailLine[] = [];
    for (const row of routesRows) {
      if (row.status && row.status.toLowerCase() !== 'valid') continue;
      const routeId = row.route_id;
      const override = RAIL_COLOR_MAP[routeId];
      const rawColor = row.route_color
        ? row.route_color.startsWith('#')
          ? row.route_color
          : `#${row.route_color}`
        : '#047857';
      const color = override ? override.color : rawColor;
      const textColor = override ? override.textColor : '#FFFFFF';
      const category = (row.category || 'MRT').toUpperCase() as RailCategory;

      routeMetaById.set(routeId, {
        shortName: row.route_short_name || routeId,
        longName: row.route_long_name || routeId,
        desc: row.route_desc || '',
        category,
        color,
        textColor,
      });

      // Find primary direction_0 shape for line polyline
      const routeTrips = tripsByRoute.get(routeId) || [];
      const primaryTrip =
        routeTrips.find((t) => t.directionId === '0' && t.shapeId) || routeTrips[0];
      let shapePoints: [number, number][] = [];
      if (primaryTrip && primaryTrip.shapeId && shapesById.has(primaryTrip.shapeId)) {
        const rawPts = shapesById.get(primaryTrip.shapeId)!;
        shapePoints = downsampleCoords(
          rawPts.map((p) => [p.lat, p.lon] as [number, number]),
          260
        );
      }

      lines.push({
        routeId,
        shortName: row.route_short_name || routeId,
        longName: row.route_long_name || routeId,
        desc: row.route_desc || '',
        category,
        color,
        textColor,
        stationCount: 0,
        shapePoints,
      });
    }

    // 6. Determine canonical station sequence per route from direction_0 MonFri trip
    const stationSeqByStopId = new Map<string, number>();
    for (const line of lines) {
      const routeTrips = tripsByRoute.get(line.routeId) || [];
      const refTrip =
        routeTrips.find((t) => t.serviceId === 'MonFri' && t.directionId === '0') ||
        routeTrips[0];
      if (!refTrip) continue;
      const stList = stopTimesByTrip.get(refTrip.tripId) || [];
      for (const st of stList) {
        stationSeqByStopId.set(st.stopId, st.sequence);
      }
    }

    // 7. Build RailStations
    const stations: RailStation[] = [];
    const stationsById = new Map<string, RailStation>();
    for (const row of stopsRows) {
      if (row.status && row.status.toLowerCase() !== 'valid') continue;
      const lat = Number.parseFloat(row.stop_lat);
      const lon = Number.parseFloat(row.stop_lon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      // Prasarana stops.txt labels MRT Kajang Line stops with route_id="MRT" while routes.txt uses "KGL"
      let routeId = row.route_id;
      if (routeId === 'MRT' || (row.stop_id && row.stop_id.startsWith('KG'))) {
        routeId = 'KGL';
      }
      const meta = routeMetaById.get(routeId);
      if (!meta) continue;

      const station: RailStation = {
        stopId: row.stop_id,
        stopName: row.stop_name,
        displayName: titleCaseStation(row.stop_name),
        lat,
        lon,
        routeId,
        routeShortName: meta.shortName,
        routeLongName: meta.longName,
        routeColor: meta.color,
        category: meta.category,
        sequence: stationSeqByStopId.get(row.stop_id) ?? 999,
        isOku: String(row.isOKU).toLowerCase() === 'true',
        interchanges: [],
      };
      stations.push(station);
      stationsById.set(station.stopId, station);
    }

    // Sort stations cleanly by route and sequence
    stations.sort((a, b) => {
      if (a.routeId !== b.routeId) return a.routeId.localeCompare(b.routeId);
      return a.sequence - b.sequence;
    });

    // Fallback shape points from ordered stations if shapes.txt had none for a line
    for (const line of lines) {
      const lineStations = stations.filter((s) => s.routeId === line.routeId);
      line.stationCount = lineStations.length;
      if (line.shapePoints.length === 0 && lineStations.length > 1) {
        line.shapePoints = lineStations.map((s) => [s.lat, s.lon]);
      }
    }

    // 8. Link interchanges (same normalized name or within 220m on a different route)
    for (let i = 0; i < stations.length; i++) {
      const sA = stations[i];
      const keyA = normalizeStationKey(sA.stopName);
      for (let j = 0; j < stations.length; j++) {
        if (i === j) continue;
        const sB = stations[j];
        if (sA.routeId === sB.routeId) continue;
        const keyB = normalizeStationKey(sB.stopName);
        const sameName = keyA.length > 3 && keyA === keyB;
        const closeBy = haversineMeters(sA.lat, sA.lon, sB.lat, sB.lon) <= 220;
        if (sameName || closeBy) {
          if (!sA.interchanges.some((x) => x.stopId === sB.stopId)) {
            const ref: InterchangeRef = {
              stopId: sB.stopId,
              stopName: sB.displayName,
              routeId: sB.routeId,
              routeShortName: sB.routeShortName,
              routeLongName: sB.routeLongName,
              routeColor: sB.routeColor,
              category: sB.category,
            };
            sA.interchanges.push(ref);
          }
        }
      }
    }

    console.log(
      `[GTFS] Loaded rapid-rail-kl: ${lines.length} lines, ${stations.length} stations`
    );

    return {
      lines,
      stations,
      stationsById,
      calendarByServiceId,
      tripsById,
      tripsByRoute,
      stopTimesByTrip,
      frequenciesByTrip,
      loadedAt: Date.now(),
    };
  }

  public async getRailNetwork(): Promise<RailNetworkPayload> {
    const store = await this.ensureRailLoaded();
    const myt = getMalaysiaNow();
    return {
      lines: store.lines,
      stations: store.stations,
      serverTimeMyt: myt.timeStr,
      serverDateMyt: myt.dateStr,
      dayType: myt.dayType,
      source: 'Prasarana Rapid KL · api.data.gov.my',
      lastSyncedAt: new Date(store.loadedAt).toISOString(),
    };
  }

  public async getStationDepartures(
    stopId: string,
    options?: { time?: string; day?: string }
  ): Promise<StationDeparturePayload | null> {
    const store = await this.ensureRailLoaded();
    const station = store.stationsById.get(stopId);
    if (!station) return null;

    const myt = getMalaysiaNow();
    let querySec = myt.secondsSinceMidnight;
    let isLiveTime = true;

    if (options?.time && /^\d{1,2}:\d{2}$/.test(options.time)) {
      querySec = parseGtfsTime(`${options.time}:00`);
      isLiveTime = false;
    }

    let dayType: 'MonFri' | 'Sat' | 'Sun' = myt.dayType;
    let targetWeekdayIdx = myt.weekdayIndex;
    if (options?.day === 'weekday' || options?.day === 'MonFri') {
      dayType = 'MonFri';
      targetWeekdayIdx = 2;
    } else if (options?.day === 'sat' || options?.day === 'Sat') {
      dayType = 'Sat';
      targetWeekdayIdx = 5;
    } else if (options?.day === 'sun' || options?.day === 'Sun') {
      dayType = 'Sun';
      targetWeekdayIdx = 6;
    }

    const activeServiceIds = resolveActiveServiceIds(
      store.calendarByServiceId,
      targetWeekdayIdx,
      myt.yyyymmdd,
      dayType
    );

    const routeTrips = store.tripsByRoute.get(station.routeId) || [];
    const activeTrips = routeTrips.filter((t) => activeServiceIds.has(t.serviceId));
    const candidateTrips = activeTrips.length > 0 ? activeTrips : routeTrips;

    const tripsByDir = new Map<string, RailTrip[]>();
    for (const trip of candidateTrips) {
      const dirKey = trip.directionId || '0';
      const arr = tripsByDir.get(dirKey) || [];
      arr.push(trip);
      tripsByDir.set(dirKey, arr);
    }

    const directions: DirectionDepartures[] = [];
    let usedFrequencyExpansion = false;
    let usedExplicitTimetable = false;

    for (const [directionId, dirTrips] of tripsByDir.entries()) {
      const allArrivals: { arrSec: number; headwaySec: number }[] = [];
      const seenArrivals = new Set<number>();
      let repTrip: RailTrip | null = null;
      let nextStopMeta: RailStation | null = null;
      let nextStopMinutes: number | null = null;

      for (const trip of dirTrips) {
        const stopTimes = store.stopTimesByTrip.get(trip.tripId);
        if (!stopTimes || stopTimes.length === 0) continue;

        const idx = stopTimes.findIndex((st) => st.stopId === stopId);
        if (idx === -1 || idx === stopTimes.length - 1) continue;

        const firstStop = stopTimes[0];
        const currentStop = stopTimes[idx];
        const nextStopEntry = stopTimes[idx + 1];

        if (!repTrip) {
          repTrip = trip;
          nextStopMeta = nextStopEntry ? store.stationsById.get(nextStopEntry.stopId) || null : null;
          nextStopMinutes = nextStopEntry
            ? Math.max(1, Math.round((nextStopEntry.arrivalSec - currentStop.departureSec) / 60))
            : null;
        }

        const freqs = store.frequenciesByTrip.get(trip.tripId) || [];
        if (freqs.length > 0) {
          // Official GTFS frequencies.txt spec: offset from first stop's arrival_time
          usedFrequencyExpansion = true;
          const travelOffsetSec = Math.max(0, currentStop.arrivalSec - firstStop.arrivalSec);
          for (const f of freqs) {
            const step = Math.max(60, f.headwaySec);
            for (let originDep = f.startSec; originDep <= f.endSec; originDep += step) {
              const arrSec = originDep + travelOffsetSec;
              if (seenArrivals.has(arrSec)) continue;
              seenArrivals.add(arrSec);
              allArrivals.push({ arrSec, headwaySec: f.headwaySec });
            }
          }
        } else {
          // Explicit per-trip arrival_time from stop_times.txt
          usedExplicitTimetable = true;
          const arrSec = currentStop.arrivalSec;
          if (!seenArrivals.has(arrSec)) {
            seenArrivals.add(arrSec);
            allArrivals.push({ arrSec, headwaySec: 0 });
          }
        }
      }

      if (!repTrip || allArrivals.length === 0) continue;

      allArrivals.sort((a, b) => a.arrSec - b.arrSec);

      for (let i = 0; i < allArrivals.length; i++) {
        if (allArrivals[i].headwaySec <= 0) {
          const prevGap = i > 0 ? allArrivals[i].arrSec - allArrivals[i - 1].arrSec : 0;
          const nextGap =
            i < allArrivals.length - 1 ? allArrivals[i + 1].arrSec - allArrivals[i].arrSec : 0;
          allArrivals[i].headwaySec = nextGap || prevGap || 600;
        }
      }

      const firstTrainSec = allArrivals[0].arrSec;
      const lastTrainSec = allArrivals[allArrivals.length - 1].arrSec;

      // Compute minimum headway across the day to identify peak windows accurately
      const minHeadway = Math.min(...allArrivals.map((a) => a.headwaySec));
      const maxHeadway = Math.max(...allArrivals.map((a) => a.headwaySec));

      // Handle post-midnight active service (e.g. 00:05 MYT -> compare against 24:05 = 86700)
      const effectiveQuerySec =
        querySec < 2 * 3600 && lastTrainSec >= 24 * 3600 ? querySec + 24 * 3600 : querySec;

      const remainingToday = allArrivals.filter((a) => a.arrSec >= effectiveQuerySec - 30);
      const serviceActive =
        effectiveQuerySec >= firstTrainSec - 1800 && effectiveQuerySec <= lastTrainSec + 60;

      const upcoming: UpcomingTrain[] = [];

      if (remainingToday.length > 0) {
        for (const item of remainingToday.slice(0, 6)) {
          const secondsAway = Math.max(0, item.arrSec - effectiveQuerySec);
          const minutesAway = Math.ceil(secondsAway / 60);
          const isPeak = maxHeadway > minHeadway && item.headwaySec === minHeadway;
          upcoming.push({
            arrivalTime: formatSecToHHMM(item.arrSec),
            secondsAway,
            minutesAway,
            headwayMinutes: Math.max(1, Math.round(item.headwaySec / 60)),
            isPeak,
            isTomorrow: false,
            status: minutesAway <= 1 ? 'arriving' : minutesAway <= 4 ? 'soon' : 'scheduled',
          });
        }
      } else {
        // After last train: show first 4 trains of tomorrow morning
        for (const item of allArrivals.slice(0, 4)) {
          const secondsAway = 86400 - effectiveQuerySec + item.arrSec;
          const minutesAway = Math.ceil(secondsAway / 60);
          const isPeak = maxHeadway > minHeadway && item.headwaySec === minHeadway;
          upcoming.push({
            arrivalTime: formatSecToHHMM(item.arrSec),
            secondsAway,
            minutesAway,
            headwayMinutes: Math.max(1, Math.round(item.headwaySec / 60)),
            isPeak,
            isTomorrow: true,
            status: 'tomorrow',
          });
        }
      }

      const { origin, destination } = parseDestinationFromHeadsign(repTrip.headsign);
      const nextUpcoming = upcoming[0];

      directions.push({
        directionId,
        tripId: repTrip.tripId,
        headsign: repTrip.headsign,
        destinationName: destination,
        originName: origin,
        nextStopName: nextStopMeta ? nextStopMeta.displayName : null,
        nextStopMinutes,
        firstTrain: formatSecToHHMM(firstTrainSec),
        lastTrain: formatSecToHHMM(lastTrainSec),
        currentHeadwayMinutes: nextUpcoming ? nextUpcoming.headwayMinutes : 5,
        isPeakNow: nextUpcoming ? nextUpcoming.isPeak : false,
        serviceActive,
        upcoming,
      });
    }

    directions.sort((a, b) => a.directionId.localeCompare(b.directionId));

    const lineStations = store.stations
      .filter((s) => s.routeId === station.routeId)
      .map((s) => ({
        stopId: s.stopId,
        displayName: s.displayName,
        sequence: s.sequence,
        isCurrent: s.stopId === stopId,
      }));

    const scheduleMode: 'timetable' | 'frequency' =
      usedExplicitTimetable && !usedFrequencyExpansion ? 'timetable' : 'frequency';

    return {
      station,
      queryTimeMyt: isLiveTime ? myt.timeStr.slice(0, 5) : formatSecToHHMM(querySec),
      isLiveTime,
      dayType,
      scheduleMode,
      gtfsSyncedAt: new Date(store.loadedAt).toISOString(),
      directions,
      lineStations,
      dataNotice:
        scheduleMode === 'timetable'
          ? 'Lịch trình từng chuyến trực tiếp từ stop_times.txt + calendar.txt GTFS Prasarana (api.data.gov.my) theo giờ KL (MYT · UTC+8).'
          : 'Dữ liệu mở api.data.gov.my của Prasarana hiện chỉ công bố lịch tĩnh theo tần suất (stop_times.txt + calendar.txt + frequencies.txt) và không có luồng GPS tàu trực tiếp, nên giờ tàu thực tế trên bảng LED tại ga có thể lệch vài phút.',
    };
  }

  public async ensureBusStaticLoaded(force = false): Promise<void> {
    const categories: BusCategory[] = ['rapid-bus-kl', 'rapid-bus-mrtfeeder'];
    const allFresh = categories.every((cat) => {
      const s = this.busStaticStores.get(cat);
      return s && Date.now() - s.loadedAt < STATIC_CACHE_TTL_MS;
    });
    if (!force && allFresh) return;
    if (this.busStaticLoadingPromise) return this.busStaticLoadingPromise;

    this.busStaticLoadingPromise = (async () => {
      for (const cat of categories) {
        const existing = this.busStaticStores.get(cat);
        if (!force && existing && Date.now() - existing.loadedAt < STATIC_CACHE_TTL_MS) {
          continue;
        }
        const waitMs = Math.max(0, this.throttleUntilMs - Date.now());
        if (waitMs > 0) await sleepMs(waitMs + 250);
        await this.loadBusStaticCategory(cat);
        await sleepMs(1500);
      }
    })().finally(() => {
      this.busStaticLoadingPromise = null;
    });

    return this.busStaticLoadingPromise;
  }

  private async loadBusStaticCategory(category: BusCategory): Promise<void> {
    try {
      const url = `${API_BASE}/gtfs-static/prasarana?category=${category}`;
      const res = await fetchWithTimeout(url, 30000);
      const buffer = Buffer.from(await res.arrayBuffer());
      const zip = new AdmZip(buffer);

      const routesRows = parseCsv(readZipEntryText(zip, 'routes.txt'));
      const tripsRows = parseCsv(readZipEntryText(zip, 'trips.txt'));
      const stopsRows = parseCsv(readZipEntryText(zip, 'stops.txt'));

      const defaultColor = category === 'rapid-bus-mrtfeeder' ? '#4F46E5' : '#0284C7';
      const routesById = new Map<string, BusRouteInternal>();
      const routesByCode = new Map<string, BusRouteInternal>();

      for (const row of routesRows) {
        const routeId = row.route_id;
        if (!routeId) continue;
        // rapid-bus-mrtfeeder puts "T565" in route_long_name and leaves route_short_name blank
        const shortName = (row.route_short_name || row.route_long_name || routeId).trim();
        const longName = (row.route_long_name || row.route_short_name || routeId).trim();
        const entry: BusRouteInternal = {
          routeId,
          routeShortName: shortName,
          routeLongName: longName,
          category,
          color: defaultColor,
        };
        routesById.set(routeId, entry);
        routesByCode.set(shortName.toUpperCase(), entry);
        if (longName) {
          routesByCode.set(longName.toUpperCase(), entry);
        }
      }

      const tripsById = new Map<string, BusTripInternal>();
      for (const row of tripsRows) {
        const tripId = row.trip_id;
        const routeId = row.route_id;
        if (!tripId || !routeId) continue;
        const headsign = (row.trip_headsign || '').trim();
        const shapeId = (row.shape_id || '').trim();
        tripsById.set(tripId, {
          tripId,
          routeId,
          headsign,
          shapeId,
        });
        const route = routesById.get(routeId);
        if (route && !route.sampleTripId) {
          route.sampleTripId = tripId;
          route.sampleShapeId = shapeId;
          // Enrich mrtfeeder longName with headsign when longName is just the code
          if (
            category === 'rapid-bus-mrtfeeder' &&
            headsign &&
            route.routeLongName === route.routeShortName
          ) {
            route.routeLongName = headsign;
          }
        }
      }

      const stopsById = new Map<string, BusStopInternal>();
      for (const row of stopsRows) {
        const lat = Number.parseFloat(row.stop_lat);
        const lon = Number.parseFloat(row.stop_lon);
        if (!row.stop_id || Number.isNaN(lat) || Number.isNaN(lon)) continue;
        stopsById.set(row.stop_id, {
          stopId: row.stop_id,
          stopCode: row.stop_code || '',
          stopName: titleCaseStation(row.stop_name || ''),
          lat,
          lon,
        });
      }

      this.busStaticStores.set(category, {
        category,
        routesById,
        routesByCode,
        tripsById,
        stopsById,
        zipBuffer: buffer,
        loadedAt: Date.now(),
      });

      console.log(
        `[GTFS] Loaded ${category}: ${routesById.size} routes, ${stopsById.size} stops`
      );
    } catch (err) {
      console.error(`[GTFS] Failed loading ${category}:`, (err as Error).message);
    }
  }

  private async fetchRealtimeCategory(category: BusCategory): Promise<LiveBusVehicle[]> {
    const url = `${API_BASE}/gtfs-realtime/vehicle-position/prasarana?category=${category}`;
    const res = await fetchWithTimeout(url, 15000);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);

    const store = this.busStaticStores.get(category);
    const nowSec = Math.floor(Date.now() / 1000);
    const defaultColor = category === 'rapid-bus-mrtfeeder' ? '#4F46E5' : '#0284C7';
    const vehicles: LiveBusVehicle[] = [];

    for (const entity of feed.entity) {
      const v = entity.vehicle;
      if (!v || !v.position) continue;
      const lat = Number(v.position.latitude);
      const lon = Number(v.position.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lon) || (lat === 0 && lon === 0)) continue;

      const rawRouteId = (v.trip?.routeId || '').trim();
      const rawTripId = (v.trip?.tripId || '').trim();
      const vehicleId = (v.vehicle?.id || entity.id || '').trim();
      const licensePlate = (v.vehicle?.licensePlate || vehicleId || 'Unknown').trim();

      const tripInfo = store?.tripsById.get(rawTripId);
      const routeInfo =
        store?.routesById.get(rawRouteId) ||
        (tripInfo ? store?.routesById.get(tripInfo.routeId) : undefined) ||
        store?.routesByCode.get(rawRouteId.toUpperCase());

      const routeShortName = routeInfo?.routeShortName || rawRouteId || 'BUS';
      const routeLongName =
        routeInfo?.routeLongName || tripInfo?.headsign || `Tuyến ${routeShortName}`;
      const headsign = tripInfo?.headsign || routeLongName;

      const tsNum = v.timestamp ? Number(v.timestamp) : nowSec;
      const updatedSecondsAgo = Math.max(0, nowSec - tsNum);
      const rawSpeed = typeof v.position.speed === 'number' ? v.position.speed : 0;
      // Prasarana GTFS-RT already reports vehicle speed in km/h
      const speedKmh = Math.max(0, Math.min(120, Math.round(rawSpeed)));
      const bearing =
        typeof v.position.bearing === 'number'
          ? ((Math.round(v.position.bearing) % 360) + 360) % 360
          : 0;

      vehicles.push({
        id: `${category}:${vehicleId}:${rawRouteId}`,
        vehicleId,
        licensePlate,
        category,
        routeId: routeInfo?.routeId || rawRouteId,
        routeShortName,
        routeLongName,
        headsign,
        tripId: rawTripId,
        lat,
        lon,
        bearing,
        speedKmh,
        timestamp: tsNum,
        updatedSecondsAgo,
        color: defaultColor,
      });
    }

    return vehicles;
  }

  public async getLiveBuses(options?: {
    category?: string;
    route?: string;
    force?: boolean;
  }): Promise<LiveBusesPayload> {
    if (this.busStaticStores.size === 0 && !this.busStaticLoadingPromise) {
      setTimeout(() => {
        if (this.busStaticStores.size === 0 && !this.busStaticLoadingPromise) {
          this.ensureBusStaticLoaded().catch(() => {});
        }
      }, 2500);
    }

    const now = Date.now();
    let cache = this.busRealtimeCache;
    const isExpired = !cache || now - cache.fetchedAt > REALTIME_CACHE_TTL_MS;
    const isThrottled = now < this.throttleUntilMs;

    if ((options?.force || isExpired) && !isThrottled) {
      if (!this.busRealtimePromise) {
        this.busRealtimePromise = (async () => {
          const categories: BusCategory[] = ['rapid-bus-kl', 'rapid-bus-mrtfeeder'];
          const klEntry = this.busCategoryCache.get('rapid-bus-kl');
          const feederEntry = this.busCategoryCache.get('rapid-bus-mrtfeeder');

          let targetCat: BusCategory;
          if (!klEntry && !feederEntry) {
            targetCat =
              options?.category === 'rapid-bus-mrtfeeder' ? 'rapid-bus-mrtfeeder' : 'rapid-bus-kl';
          } else if (!feederEntry) {
            targetCat = 'rapid-bus-mrtfeeder';
          } else if (!klEntry) {
            targetCat = 'rapid-bus-kl';
          } else if (
            options?.category === 'rapid-bus-kl' ||
            options?.category === 'rapid-bus-mrtfeeder'
          ) {
            const otherCat: BusCategory =
              options.category === 'rapid-bus-kl' ? 'rapid-bus-mrtfeeder' : 'rapid-bus-kl';
            const otherEntry = this.busCategoryCache.get(otherCat);
            const otherAge = otherEntry ? Date.now() - otherEntry.fetchedAt : Infinity;
            targetCat = otherAge > 16000 ? otherCat : options.category;
          } else {
            targetCat = categories[this.nextPollCategoryIndex % 2];
            this.nextPollCategoryIndex += 1;
          }

          try {
            const freshVehicles = await this.fetchRealtimeCategory(targetCat);
            this.busCategoryCache.set(targetCat, {
              vehicles: freshVehicles,
              fetchedAt: Date.now(),
            });
          } catch (err) {
            if (err instanceof RateLimitError) {
              this.throttleUntilMs = Date.now() + (err.retryAfterSec + 1) * 1000;
            }
          }

          const nowSec = Math.floor(Date.now() / 1000);
          const klNow = this.busCategoryCache.get('rapid-bus-kl');
          const feederNow = this.busCategoryCache.get('rapid-bus-mrtfeeder');

          const combined: LiveBusVehicle[] = [
            ...(klNow?.vehicles || []),
            ...(feederNow?.vehicles || []),
          ].map((v) => ({
            ...v,
            updatedSecondsAgo: Math.max(0, nowSec - v.timestamp),
          }));

          const warnings: string[] = [];
          const staleCutoffMs = 90_000;
          if (klNow && Date.now() - klNow.fetchedAt > staleCutoffMs) {
            warnings.push('Rapid Bus KL đang chờ đồng bộ từ api.data.gov.my');
          }
          if (feederNow && Date.now() - feederNow.fetchedAt > staleCutoffMs) {
            warnings.push('MRT Feeder đang chờ đồng bộ từ api.data.gov.my');
          }

          const nextCache: BusRealtimeCache = {
            vehicles: combined,
            fetchedAt: Date.now(),
            staleWarning: warnings.length > 0 ? warnings.join(' · ') : undefined,
          };
          this.busRealtimeCache = nextCache;
          return nextCache;
        })().finally(() => {
          this.busRealtimePromise = null;
        });
      }
      cache = await this.busRealtimePromise;
    }

    const allVehicles = cache?.vehicles || [];
    const rapidBusKlCount = allVehicles.filter((v) => v.category === 'rapid-bus-kl').length;
    const mrtFeederCount = allVehicles.filter((v) => v.category === 'rapid-bus-mrtfeeder').length;

    let filtered = allVehicles;
    if (options?.category === 'rapid-bus-kl' || options?.category === 'rapid-bus-mrtfeeder') {
      filtered = filtered.filter((v) => v.category === options.category);
    }
    if (options?.route) {
      const q = options.route.trim().toUpperCase();
      filtered = filtered.filter(
        (v) =>
          v.routeShortName.toUpperCase() === q ||
          v.routeId.toUpperCase() === q ||
          v.routeShortName.toUpperCase().includes(q)
      );
    }

    // Aggregate active route summaries
    const routeMap = new Map<string, BusRouteSummary>();
    for (const v of filtered) {
      const key = `${v.category}:${v.routeId || v.routeShortName}`;
      const existing = routeMap.get(key);
      if (existing) {
        existing.activeBusCount += 1;
      } else {
        routeMap.set(key, {
          routeKey: key,
          routeId: v.routeId || v.routeShortName,
          routeShortName: v.routeShortName,
          routeLongName: v.routeLongName,
          category: v.category,
          activeBusCount: 1,
          color: v.color,
        });
      }
    }

    const routes = Array.from(routeMap.values()).sort((a, b) => {
      if (b.activeBusCount !== a.activeBusCount) return b.activeBusCount - a.activeBusCount;
      return a.routeShortName.localeCompare(b.routeShortName, undefined, { numeric: true });
    });

    const myt = getMalaysiaNow();

    return {
      vehicles: filtered,
      routes,
      counts: {
        total: allVehicles.length,
        rapidBusKl: rapidBusKlCount,
        mrtFeeder: mrtFeederCount,
      },
      fetchedAt: new Date(cache?.fetchedAt || Date.now()).toISOString(),
      serverTimeMyt: myt.timeStr,
      staticReady: this.busStaticStores.size > 0,
      staleWarning: cache?.staleWarning,
    };
  }

  public async getBusRouteDetail(
    category: BusCategory,
    routeIdOrCode: string,
    preferredTripId?: string
  ): Promise<BusRouteDetailPayload | null> {
    await this.ensureBusStaticLoaded();
    const store = this.busStaticStores.get(category);
    if (!store) return null;

    const route =
      store.routesById.get(routeIdOrCode) ||
      store.routesByCode.get(routeIdOrCode.toUpperCase());
    if (!route) return null;

    const trip =
      (preferredTripId ? store.tripsById.get(preferredTripId) : undefined) ||
      (route.sampleTripId ? store.tripsById.get(route.sampleTripId) : undefined);

    const cacheKey = `${category}:${route.routeId}:${trip?.shapeId || 'none'}`;
    let cachedGeom = this.busRouteShapeCache.get(cacheKey);

    if (!cachedGeom) {
      const zip = new AdmZip(store.zipBuffer);
      const shapePoints: [number, number][] = [];
      const stops: BusStopPoint[] = [];

      // Extract matching shape points lazily from shapes.txt
      const targetShapeId = trip?.shapeId || route.sampleShapeId;
      if (targetShapeId) {
        const shapesText = readZipEntryText(zip, 'shapes.txt');
        const lines = shapesText.split(/\r?\n/);
        const header = (lines[0] || '').replace(/^\uFEFF/, '').split(',');
        const idIdx = header.indexOf('shape_id');
        const latIdx = header.indexOf('shape_pt_lat');
        const lonIdx = header.indexOf('shape_pt_lon');
        const seqIdx = header.indexOf('shape_pt_sequence');

        if (idIdx >= 0 && latIdx >= 0 && lonIdx >= 0) {
          const pts: { seq: number; lat: number; lon: number }[] = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || !line.includes(targetShapeId)) continue;
            const cols = line.split(',');
            if (cols[idIdx]?.trim() !== targetShapeId) continue;
            const lat = Number.parseFloat(cols[latIdx]);
            const lon = Number.parseFloat(cols[lonIdx]);
            const seq = seqIdx >= 0 ? Number.parseInt(cols[seqIdx], 10) || i : i;
            if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
              pts.push({ seq, lat, lon });
            }
          }
          pts.sort((a, b) => a.seq - b.seq);
          shapePoints.push(
            ...downsampleCoords(
              pts.map((p) => [p.lat, p.lon] as [number, number]),
              180
            )
          );
        }
      }

      // Extract ordered stops lazily from stop_times.txt for the matched trip
      const targetTripId = trip?.tripId || route.sampleTripId;
      if (targetTripId) {
        const stopTimesText = readZipEntryText(zip, 'stop_times.txt');
        const lines = stopTimesText.split(/\r?\n/);
        const header = (lines[0] || '').replace(/^\uFEFF/, '').split(',');
        const tripIdx = header.indexOf('trip_id');
        const stopIdx = header.indexOf('stop_id');
        const seqIdx = header.indexOf('stop_sequence');

        if (tripIdx >= 0 && stopIdx >= 0) {
          const matched: { seq: number; stopId: string }[] = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (!line || !line.includes(targetTripId)) continue;
            const cols = line.split(',');
            if (cols[tripIdx]?.trim() !== targetTripId) continue;
            matched.push({
              seq: seqIdx >= 0 ? Number.parseInt(cols[seqIdx], 10) || i : i,
              stopId: cols[stopIdx]?.trim(),
            });
          }
          matched.sort((a, b) => a.seq - b.seq);
          for (const item of matched) {
            const s = store.stopsById.get(item.stopId);
            if (s) {
              stops.push({
                stopId: s.stopId,
                stopCode: s.stopCode,
                stopName: s.stopName,
                lat: s.lat,
                lon: s.lon,
                sequence: item.seq,
              });
            }
          }
        }
      }

      // Keep route geometry cache bounded
      if (this.busRouteShapeCache.size > 60) {
        const firstKey = this.busRouteShapeCache.keys().next().value;
        if (firstKey) this.busRouteShapeCache.delete(firstKey);
      }

      cachedGeom = { shapePoints, stops };
      this.busRouteShapeCache.set(cacheKey, cachedGeom);
    }

    const live = await this.getLiveBuses({ category, route: route.routeShortName });

    return {
      route: {
        routeKey: `${category}:${route.routeId}`,
        routeId: route.routeId,
        routeShortName: route.routeShortName,
        routeLongName: route.routeLongName,
        category,
        activeBusCount: live.vehicles.length,
        color: route.color,
      },
      shapePoints: cachedGeom.shapePoints,
      stops: cachedGeom.stops,
      vehicles: live.vehicles,
    };
  }

  public async getNearbyTransit(
    lat: number,
    lon: number,
    limit = 6
  ): Promise<NearbyTransitPayload> {
    const railStore = await this.ensureRailLoaded();
    if (this.busStaticStores.size === 0) {
      await this.ensureBusStaticLoaded();
    }

    const safeLimit = Math.max(1, Math.min(20, limit));
    const KL_CENTER_LAT = 3.1478;
    const KL_CENTER_LON = 101.6953;
    const distanceToKlCenterKm =
      Math.round((haversineMeters(lat, lon, KL_CENTER_LAT, KL_CENTER_LON) / 1000) * 10) / 10;

    // Nearest Rail Stations (MRT, LRT, Monorail, BRT)
    const railStations: NearbyRailStation[] = railStore.stations
      .map((st) => {
        const distM = Math.round(haversineMeters(lat, lon, st.lat, st.lon));
        return {
          stopId: st.stopId,
          displayName: st.displayName,
          routeId: st.routeId,
          routeShortName: st.routeShortName,
          routeLongName: st.routeLongName,
          routeColor: st.routeColor,
          category: st.category,
          lat: st.lat,
          lon: st.lon,
          distanceMeters: distM,
          walkMinutes: Math.max(1, Math.round(distM / 78)),
        };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, safeLimit);

    // Nearest Bus Stops across rapid-bus-kl & rapid-bus-mrtfeeder
    const seenStopKeys = new Set<string>();
    const allBusStops: NearbyBusStop[] = [];
    for (const [category, store] of this.busStaticStores.entries()) {
      for (const stop of store.stopsById.values()) {
        const dedupKey = `${stop.stopName.toLowerCase()}:${stop.lat.toFixed(4)}:${stop.lon.toFixed(4)}`;
        if (seenStopKeys.has(dedupKey)) continue;
        seenStopKeys.add(dedupKey);
        const distM = Math.round(haversineMeters(lat, lon, stop.lat, stop.lon));
        allBusStops.push({
          stopId: stop.stopId,
          stopCode: stop.stopCode,
          stopName: stop.stopName,
          category,
          lat: stop.lat,
          lon: stop.lon,
          distanceMeters: distM,
          walkMinutes: Math.max(1, Math.round(distM / 78)),
        });
      }
    }

    const busStops = allBusStops
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, safeLimit);

    return {
      lat,
      lon,
      distanceToKlCenterKm,
      railStations,
      busStops,
      busStopsLoaded: this.busStaticStores.size > 0,
    };
  }
}

export const gtfsService = new GtfsService();
