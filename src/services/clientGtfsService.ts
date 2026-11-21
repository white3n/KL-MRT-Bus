import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { strFromU8, unzipSync } from 'fflate';
import { findMyBusStationIndexInStops, type MyBusStation } from '../hooks/useMyStations';
import type {
  BusCategory,
  BusRouteDetailPayload,
  BusRouteSummary,
  BusStopPoint,
  BusStopSearchItem,
  BusTripApproachingLive,
  BusTripLeg,
  BusTripOption,
  BusTripPlanPayload,
  DirectionDepartures,
  InterchangeRef,
  LiveBusesPayload,
  LiveBusVehicle,
  MyBusStationArrival,
  NearbyBusStop,
  NearbyRailStation,
  NearbyTransitPayload,
  RailCategory,
  RailLine,
  RailNetworkPayload,
  RailStation,
  StationDeparturePayload,
  UpcomingTrain,
} from '../types/transit';
import { findDirectionAlignedStopIndex } from '../utils/busApproach';
import { estimateRapidKlBusFare } from '../utils/fareCalculator';

const API_BASE = 'https://api.data.gov.my';
const STATIC_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REALTIME_CACHE_TTL_MS = 2000;
const RAIL_STORAGE_KEY = 'kl_transit_rail_payload_v1';
const RAIL_ZIP_CACHE_KEY = 'kl_transit_rail_gtfs_zip_v2';

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

const RAIL_COLOR_MAP: Record<string, { color: string; textColor: string }> = {
  AG: { color: '#EA580C', textColor: '#FFFFFF' },
  PH: { color: '#9F1239', textColor: '#FFFFFF' },
  KJ: { color: '#E11D48', textColor: '#FFFFFF' },
  KGL: { color: '#047857', textColor: '#FFFFFF' },
  PYL: { color: '#CA8A04', textColor: '#FFFFFF' },
  MR: { color: '#65A30D', textColor: '#FFFFFF' },
  BRT: { color: '#15803D', textColor: '#FFFFFF' },
  SA: { color: '#9333EA', textColor: '#FFFFFF' },
};

type RawCsvRow = Record<string, string>;

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
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD
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
  zipEntries: Record<string, Uint8Array>;
  loadedAt: number;
}

interface BusRoutePattern {
  patternId: string;
  category: BusCategory;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  color: string;
  stops: BusStopPoint[];
}

interface BusPlannerIndex {
  builtAt: number;
  patterns: BusRoutePattern[];
  searchableStops: BusStopSearchItem[];
}

interface BusRealtimeCache {
  vehicles: LiveBusVehicle[];
  fetchedAt: number;
  staleWarning?: string;
}

// ---------- Binary HTTP Fetcher (Capacitor Native HTTP + Web fallback) ----------

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/\s+/g, '');
  const binary = atob(clean);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function fetchBinary(url: string, timeoutMs = 25000): Promise<Uint8Array> {
  if (Capacitor.isNativePlatform()) {
    const res = await CapacitorHttp.get({
      url,
      responseType: 'arraybuffer',
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
      headers: {
        'User-Agent': 'KLTransitLive/1.0 (+https://data.gov.my)',
      },
    });
    if (res.status === 429) {
      const hdr =
        (res.headers?.['Retry-After'] as string | undefined) ||
        (res.headers?.['retry-after'] as string | undefined);
      let bodyText = '';
      if (typeof res.data === 'string') {
        try {
          bodyText = atob(res.data.replace(/\s+/g, ''));
        } catch {
          bodyText = res.data;
        }
      }
      throw new RateLimitError(parseThrottleSeconds(bodyText, hdr), url);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    if (typeof res.data === 'string') {
      return base64ToUint8Array(res.data);
    }
    if (res.data instanceof ArrayBuffer) {
      return new Uint8Array(res.data);
    }
    if (ArrayBuffer.isView(res.data)) {
      return new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength);
    }
    throw new Error('Dữ liệu nhị phân trả về không hợp lệ.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // On web mobile deployments (Vercel / Cloudflare Pages / Node), prefer same-origin GTFS proxy
    // so iOS Safari & Android Chrome never hit CORS errors on api.data.gov.my static ZIP feeds.
    const proxyUrl = `/api/gtfs-proxy?url=${encodeURIComponent(url)}`;
    try {
      const proxyRes = await fetch(proxyUrl, { signal: controller.signal });
      const ct = proxyRes.headers.get('content-type') || '';
      if (proxyRes.status === 429) {
        const txt = await proxyRes.text().catch(() => '');
        throw new RateLimitError(
          parseThrottleSeconds(txt, proxyRes.headers.get('retry-after')),
          url
        );
      }
      if (proxyRes.ok && !ct.includes('text/html')) {
        return new Uint8Array(await proxyRes.arrayBuffer());
      }
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      // Fallback to direct fetch (e.g. GTFS-RT feeds with Access-Control-Allow-Origin: *)
    }

    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 429) {
      const txt = await res.text().catch(() => '');
      throw new RateLimitError(parseThrottleSeconds(txt, res.headers.get('retry-after')), url);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching ${url}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Lightweight RFC-4180 CSV Parser ----------

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCsv(text: string): RawCsvRow[] {
  if (!text || !text.trim()) return [];
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: RawCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = parseCsvLine(line);
    const row: RawCsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function readZipEntryText(entries: Record<string, Uint8Array>, filename: string): string {
  const direct = entries[filename];
  if (direct) return strFromU8(direct);
  const lower = filename.toLowerCase();
  for (const [k, v] of Object.entries(entries)) {
    if (k.toLowerCase().endsWith(lower)) {
      return strFromU8(v);
    }
  }
  return '';
}

// ---------- Minimal Zero-Dependency GTFS-Realtime Protobuf Decoder ----------

interface DecodedGtfsRtEntity {
  id: string;
  tripId: string;
  routeId: string;
  vehicleId: string;
  licensePlate: string;
  lat: number;
  lon: number;
  bearing: number;
  speed: number;
  timestamp: number;
  hasPosition: boolean;
}

class ProtoReader {
  private view: DataView;
  public pos = 0;
  public readonly end: number;

  constructor(
    private readonly buf: Uint8Array,
    start = 0,
    end = buf.length
  ) {
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.pos = start;
    this.end = end;
  }

  readVarint(): number {
    let result = 0;
    let shift = 0;
    while (this.pos < this.end) {
      const byte = this.buf[this.pos++];
      result += (byte & 0x7f) * 2 ** shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7;
      if (shift > 56) break;
    }
    return result;
  }

  readFloat(): number {
    const val = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return val;
  }

  readString(len: number): string {
    const slice = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return strFromU8(slice);
  }

  skip(wireType: number): void {
    switch (wireType) {
      case 0:
        this.readVarint();
        break;
      case 1:
        this.pos += 8;
        break;
      case 2: {
        const len = this.readVarint();
        this.pos += len;
        break;
      }
      case 5:
        this.pos += 4;
        break;
      default:
        this.pos = this.end;
        break;
    }
  }
}

function decodeGtfsRtVehiclePositions(bytes: Uint8Array): DecodedGtfsRtEntity[] {
  const entities: DecodedGtfsRtEntity[] = [];
  const root = new ProtoReader(bytes);

  while (root.pos < root.end) {
    const tag = root.readVarint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 2 && wire === 2) {
      const len = root.readVarint();
      const entityEnd = Math.min(root.end, root.pos + len);
      const ent = decodeFeedEntity(bytes, root.pos, entityEnd);
      root.pos = entityEnd;
      if (ent && ent.hasPosition) {
        entities.push(ent);
      }
    } else {
      root.skip(wire);
    }
  }

  return entities;
}

function decodeFeedEntity(
  buf: Uint8Array,
  start: number,
  end: number
): DecodedGtfsRtEntity | null {
  const r = new ProtoReader(buf, start, end);
  const out: DecodedGtfsRtEntity = {
    id: '',
    tripId: '',
    routeId: '',
    vehicleId: '',
    licensePlate: '',
    lat: NaN,
    lon: NaN,
    bearing: 0,
    speed: 0,
    timestamp: 0,
    hasPosition: false,
  };

  while (r.pos < r.end) {
    const tag = r.readVarint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      const len = r.readVarint();
      out.id = r.readString(len);
    } else if (field === 4 && wire === 2) {
      const len = r.readVarint();
      const vEnd = Math.min(r.end, r.pos + len);
      decodeVehiclePosition(buf, r.pos, vEnd, out);
      r.pos = vEnd;
    } else {
      r.skip(wire);
    }
  }

  return out;
}

function decodeVehiclePosition(
  buf: Uint8Array,
  start: number,
  end: number,
  out: DecodedGtfsRtEntity
): void {
  const r = new ProtoReader(buf, start, end);
  while (r.pos < r.end) {
    const tag = r.readVarint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      // TripDescriptor
      const len = r.readVarint();
      const subEnd = Math.min(r.end, r.pos + len);
      const sr = new ProtoReader(buf, r.pos, subEnd);
      while (sr.pos < sr.end) {
        const stag = sr.readVarint();
        const sfield = stag >>> 3;
        const swire = stag & 7;
        if (sfield === 1 && swire === 2) {
          out.tripId = sr.readString(sr.readVarint());
        } else if (sfield === 5 && swire === 2) {
          out.routeId = sr.readString(sr.readVarint());
        } else {
          sr.skip(swire);
        }
      }
      r.pos = subEnd;
    } else if (field === 2 && wire === 2) {
      // Position
      const len = r.readVarint();
      const subEnd = Math.min(r.end, r.pos + len);
      const sr = new ProtoReader(buf, r.pos, subEnd);
      while (sr.pos < sr.end) {
        const stag = sr.readVarint();
        const sfield = stag >>> 3;
        const swire = stag & 7;
        if (sfield === 1 && swire === 5) {
          out.lat = sr.readFloat();
          out.hasPosition = true;
        } else if (sfield === 2 && swire === 5) {
          out.lon = sr.readFloat();
          out.hasPosition = true;
        } else if (sfield === 3 && swire === 5) {
          out.bearing = sr.readFloat();
        } else if (sfield === 5 && swire === 5) {
          out.speed = sr.readFloat();
        } else {
          sr.skip(swire);
        }
      }
      r.pos = subEnd;
    } else if (field === 5 && wire === 0) {
      out.timestamp = r.readVarint();
    } else if (field === 8 && wire === 2) {
      // VehicleDescriptor
      const len = r.readVarint();
      const subEnd = Math.min(r.end, r.pos + len);
      const sr = new ProtoReader(buf, r.pos, subEnd);
      while (sr.pos < sr.end) {
        const stag = sr.readVarint();
        const sfield = stag >>> 3;
        const swire = stag & 7;
        if (sfield === 1 && swire === 2) {
          out.vehicleId = sr.readString(sr.readVarint());
        } else if (sfield === 3 && swire === 2) {
          out.licensePlate = sr.readString(sr.readVarint());
        } else {
          sr.skip(swire);
        }
      }
      r.pos = subEnd;
    } else {
      r.skip(wire);
    }
  }
}

// ---------- Helpers (matching server/gtfsService.ts) ----------

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

function getMalaysiaNow(): {
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
    return { origin: match[1].trim(), destination: match[2].trim() };
  }
  return { origin: '', destination: headsign || 'Terminus' };
}

// ---------- Client-side GTFS Engine ----------

class ClientGtfsService {
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

  private busRouteShapeCache: Map<
    string,
    { shapePoints: [number, number][]; stops: BusStopPoint[] }
  > = new Map();
  private busPlannerIndex: BusPlannerIndex | null = null;

  public getCachedRailPayload(): RailNetworkPayload | null {
    try {
      const raw = localStorage.getItem(RAIL_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as RailNetworkPayload;
    } catch {
      return null;
    }
  }

  private saveRailPayloadCache(payload: RailNetworkPayload): void {
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }

  private readOfflineRailZip(): { bytes: Uint8Array; fetchedAt: number } | null {
    try {
      const raw = localStorage.getItem(RAIL_ZIP_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { b64?: string; fetchedAt?: number };
      if (!parsed?.b64) return null;
      return {
        bytes: base64ToUint8Array(parsed.b64),
        fetchedAt: typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : Date.now(),
      };
    } catch {
      return null;
    }
  }

  private saveOfflineRailZip(bytes: Uint8Array, fetchedAt: number): void {
    try {
      const payload = JSON.stringify({ b64: uint8ArrayToBase64(bytes), fetchedAt });
      localStorage.setItem(RAIL_ZIP_CACHE_KEY, payload);
    } catch {
      // Ignore storage quota errors
    }
  }

  public async ensureRailLoaded(force = false): Promise<RailStaticStore> {
    if (
      !force &&
      this.railStore &&
      Date.now() - this.railStore.loadedAt < STATIC_CACHE_TTL_MS
    ) {
      return this.railStore;
    }

    // Instant offline boot from cached GTFS Static ZIP when available, with background refresh if stale
    if (!force && !this.railStore) {
      const offline = this.readOfflineRailZip();
      if (offline) {
        try {
          const parsed = this.parseRailStaticZip(offline.bytes, offline.fetchedAt);
          this.railStore = parsed;
          if (Date.now() - offline.fetchedAt >= STATIC_CACHE_TTL_MS) {
            // Silently refresh latest GTFS Static ZIP from api.data.gov.my in background
            this.loadRailStaticFromNetwork()
              .then((fresh) => {
                this.railStore = fresh;
              })
              .catch(() => {});
          }
          return parsed;
        } catch {
          // Fall through to live network fetch
        }
      }
    }

    if (this.railLoadingPromise) return this.railLoadingPromise;

    this.railLoadingPromise = this.loadRailStaticFromNetwork()
      .then((store) => {
        this.railStore = store;
        return store;
      })
      .catch((err) => {
        // Offline fallback: parse cached GTFS ZIP even on forced refresh failure
        if (this.railStore) return this.railStore;
        const offline = this.readOfflineRailZip();
        if (offline) {
          const parsed = this.parseRailStaticZip(offline.bytes, offline.fetchedAt);
          this.railStore = parsed;
          return parsed;
        }
        throw err;
      })
      .finally(() => {
        this.railLoadingPromise = null;
      });

    return this.railLoadingPromise;
  }

  private async loadRailStaticFromNetwork(): Promise<RailStaticStore> {
    const url = `${API_BASE}/gtfs-static/prasarana?category=rapid-rail-kl`;
    const bytes = await fetchBinary(url, 25000);
    const fetchedAt = Date.now();
    const store = this.parseRailStaticZip(bytes, fetchedAt);
    this.saveOfflineRailZip(bytes, fetchedAt);
    return store;
  }

  private parseRailStaticZip(bytes: Uint8Array, loadedAt: number): RailStaticStore {
    const entries = unzipSync(bytes);

    const routesRows = parseCsv(readZipEntryText(entries, 'routes.txt'));
    const stopsRows = parseCsv(readZipEntryText(entries, 'stops.txt'));
    const calendarRows = parseCsv(readZipEntryText(entries, 'calendar.txt'));
    const tripsRows = parseCsv(readZipEntryText(entries, 'trips.txt'));
    const stopTimesRows = parseCsv(readZipEntryText(entries, 'stop_times.txt'));
    const frequenciesRows = parseCsv(readZipEntryText(entries, 'frequencies.txt'));
    const shapesRows = parseCsv(readZipEntryText(entries, 'shapes.txt'));

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

    const stations: RailStation[] = [];
    const stationsById = new Map<string, RailStation>();
    for (const row of stopsRows) {
      if (row.status && row.status.toLowerCase() !== 'valid') continue;
      const lat = Number.parseFloat(row.stop_lat);
      const lon = Number.parseFloat(row.stop_lon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
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

    stations.sort((a, b) => {
      if (a.routeId !== b.routeId) return a.routeId.localeCompare(b.routeId);
      return a.sequence - b.sequence;
    });

    for (const line of lines) {
      const lineStations = stations.filter((s) => s.routeId === line.routeId);
      line.stationCount = lineStations.length;
      if (line.shapePoints.length === 0 && lineStations.length > 1) {
        line.shapePoints = lineStations.map((s) => [s.lat, s.lon]);
      }
    }

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

    return {
      lines,
      stations,
      stationsById,
      calendarByServiceId,
      tripsById,
      tripsByRoute,
      stopTimesByTrip,
      frequenciesByTrip,
      loadedAt,
    };
  }

  public async getRailNetwork(): Promise<RailNetworkPayload> {
    try {
      const store = await this.ensureRailLoaded();
      const myt = getMalaysiaNow();
      const payload: RailNetworkPayload = {
        lines: store.lines,
        stations: store.stations,
        serverTimeMyt: myt.timeStr,
        serverDateMyt: myt.dateStr,
        dayType: myt.dayType,
        source: 'Prasarana Rapid KL · api.data.gov.my',
        lastSyncedAt: new Date(store.loadedAt).toISOString(),
      };
      this.saveRailPayloadCache(payload);
      return payload;
    } catch (err) {
      const cached = this.getCachedRailPayload();
      if (cached) return cached;
      throw err;
    }
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
      targetWeekdayIdx = 2; // Wed representative weekday
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

    // Group active trips by direction_id so both explicit per-trip stop_times.txt
    // and frequency-based trips merge cleanly into 1 departure board per direction
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
          // Official GTFS frequencies.txt spec: offset from first stop's arrival_time (not departure_time)
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
          // Direct per-trip timetable row from stop_times.txt (no frequency estimation!)
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

      // Compute actual inter-train headways for explicit stop_times.txt timetables
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
      const minHeadway = Math.min(...allArrivals.map((a) => a.headwaySec));
      const maxHeadway = Math.max(...allArrivals.map((a) => a.headwaySec));

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
          ? 'Lịch trình từng chuyến đọc trực tiếp từ stop_times.txt & calendar.txt (api.data.gov.my · giờ MYT UTC+8).'
          : 'Lịch tham khảo từ GTFS Static Prasarana (calendar.txt + stop_times.txt + frequencies.txt · api.data.gov.my). Prasarana hiện chưa mở API vị trí tàu trực tiếp cho MRT/LRT nên phút thực tế trên bảng LED tại ga có thể chênh vài phút.',
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

    // Load bus static ZIPs sequentially with polite spacing to avoid triggering api.data.gov.my 429 burst throttle
    this.busStaticLoadingPromise = (async () => {
      for (const cat of categories) {
        const existing = this.busStaticStores.get(cat);
        if (!force && existing && Date.now() - existing.loadedAt < STATIC_CACHE_TTL_MS) {
          continue;
        }
        const waitMs = Math.max(0, this.throttleUntilMs - Date.now());
        if (waitMs > 0) await sleepMs(waitMs + 250);
        await this.loadBusStaticCategory(cat);
        await sleepMs(1400);
      }
    })().finally(() => {
      this.busStaticLoadingPromise = null;
    });

    return this.busStaticLoadingPromise;
  }

  private async loadBusStaticCategory(category: BusCategory): Promise<void> {
    try {
      const url = `${API_BASE}/gtfs-static/prasarana?category=${category}`;
      const bytes = await fetchBinary(url, 30000);
      const entries = unzipSync(bytes);

      const routesRows = parseCsv(readZipEntryText(entries, 'routes.txt'));
      const tripsRows = parseCsv(readZipEntryText(entries, 'trips.txt'));
      const stopsRows = parseCsv(readZipEntryText(entries, 'stops.txt'));

      const defaultColor = category === 'rapid-bus-mrtfeeder' ? '#4F46E5' : '#0284C7';
      const routesById = new Map<string, BusRouteInternal>();
      const routesByCode = new Map<string, BusRouteInternal>();

      for (const row of routesRows) {
        const routeId = row.route_id;
        if (!routeId) continue;
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
        tripsById.set(tripId, { tripId, routeId, headsign, shapeId });
        const route = routesById.get(routeId);
        if (route && !route.sampleTripId) {
          route.sampleTripId = tripId;
          route.sampleShapeId = shapeId;
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
        zipEntries: entries,
        loadedAt: Date.now(),
      });
    } catch {
      // Non-fatal: live bus GPS still works even before static metadata finishes
    }
  }

  private async fetchRealtimeCategory(category: BusCategory): Promise<LiveBusVehicle[]> {
    const url = `${API_BASE}/gtfs-realtime/vehicle-position/prasarana?category=${category}`;
    const bytes = await fetchBinary(url, 15000);
    const decoded = decodeGtfsRtVehiclePositions(bytes);

    const store = this.busStaticStores.get(category);
    const nowSec = Math.floor(Date.now() / 1000);
    const defaultColor = category === 'rapid-bus-mrtfeeder' ? '#4F46E5' : '#0284C7';
    const vehicles: LiveBusVehicle[] = [];

    for (const item of decoded) {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) continue;
      if (item.lat === 0 && item.lon === 0) continue;

      const rawRouteId = item.routeId.trim();
      const rawTripId = item.tripId.trim();
      const vehicleId = (item.vehicleId || item.id || '').trim();
      const licensePlate = (item.licensePlate || vehicleId || 'Unknown').trim();

      const tripInfo = store?.tripsById.get(rawTripId);
      const routeInfo =
        store?.routesById.get(rawRouteId) ||
        (tripInfo ? store?.routesById.get(tripInfo.routeId) : undefined) ||
        store?.routesByCode.get(rawRouteId.toUpperCase());

      const routeShortName = routeInfo?.routeShortName || rawRouteId || 'BUS';
      const routeLongName =
        routeInfo?.routeLongName || tripInfo?.headsign || `Tuyến ${routeShortName}`;
      const headsign = tripInfo?.headsign || routeLongName;

      const tsNum = item.timestamp > 0 ? item.timestamp : nowSec;
      const updatedSecondsAgo = Math.max(0, nowSec - tsNum);
      const speedKmh = Math.max(0, Math.min(120, Math.round(item.speed || 0)));
      const bearing = ((Math.round(item.bearing || 0) % 360) + 360) % 360;

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
        lat: item.lat,
        lon: item.lon,
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
    priorityCategory?: BusCategory;
  }): Promise<LiveBusesPayload> {
    if (this.busStaticStores.size === 0 && !this.busStaticLoadingPromise) {
      // Delay static ZIP downloads slightly so initial real-time bus GPS loads first without burst 429
      setTimeout(() => {
        if (this.busStaticStores.size === 0 && !this.busStaticLoadingPromise) {
          this.ensureBusStaticLoaded().catch(() => {});
        }
      }, 2800);
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

          // Pick ONE category per tick to stay strictly inside api.data.gov.my rate limits (zero burst 429s!)
          let targetCat: BusCategory;
          if (options?.force && options?.priorityCategory) {
            targetCat = options.priorityCategory;
          } else if (!klEntry && !feederEntry) {
            targetCat = options?.priorityCategory || 'rapid-bus-kl';
          } else if (!feederEntry) {
            targetCat = 'rapid-bus-mrtfeeder';
          } else if (!klEntry) {
            targetCat = 'rapid-bus-kl';
          } else if (options?.priorityCategory) {
            const otherCat: BusCategory =
              options.priorityCategory === 'rapid-bus-kl'
                ? 'rapid-bus-mrtfeeder'
                : 'rapid-bus-kl';
            const otherEntry = this.busCategoryCache.get(otherCat);
            const otherAge = otherEntry ? Date.now() - otherEntry.fetchedAt : Infinity;
            targetCat = otherAge > 16000 ? otherCat : options.priorityCategory;
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
            // Keep previously cached vehicles for this category rather than wiping them out!
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
      const shapePoints: [number, number][] = [];
      const stops: BusStopPoint[] = [];

      const targetShapeId = trip?.shapeId || route.sampleShapeId;
      if (targetShapeId) {
        const shapesText = readZipEntryText(store.zipEntries, 'shapes.txt');
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

      const targetTripId = trip?.tripId || route.sampleTripId;
      if (targetTripId) {
        const stopTimesText = readZipEntryText(store.zipEntries, 'stop_times.txt');
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

  private async ensureBusPlannerIndex(): Promise<BusPlannerIndex> {
    if (this.busStaticStores.size < 2) {
      await this.ensureBusStaticLoaded();
    }

    const newestStatic = Math.max(
      0,
      ...Array.from(this.busStaticStores.values()).map((s) => s.loadedAt)
    );
    if (this.busPlannerIndex && this.busPlannerIndex.builtAt >= newestStatic && newestStatic > 0) {
      return this.busPlannerIndex;
    }

    const patterns: BusRoutePattern[] = [];
    const routesByStopKey = new Map<string, Set<string>>();
    const stopKeyOf = (name: string, lat: number, lon: number) =>
      `${name.toLowerCase().trim()}:${lat.toFixed(3)}:${lon.toFixed(3)}`;

    for (const [category, store] of this.busStaticStores.entries()) {
      // Pick up to 2 representative trips per route (distinct headsigns/directions)
      const repTrips = new Map<
        string,
        { route: BusRouteInternal; headsign: string; tripId: string }
      >();
      const headsignsPerRoute = new Map<string, Set<string>>();

      for (const trip of store.tripsById.values()) {
        const route = store.routesById.get(trip.routeId);
        if (!route) continue;
        let seen = headsignsPerRoute.get(route.routeId);
        if (!seen) {
          seen = new Set<string>();
          headsignsPerRoute.set(route.routeId, seen);
        }
        const hsKey = (trip.headsign || route.routeLongName || 'default').toUpperCase();
        if (seen.has(hsKey) || seen.size >= 3) continue;
        seen.add(hsKey);
        repTrips.set(trip.tripId, {
          route,
          headsign: trip.headsign || route.routeLongName,
          tripId: trip.tripId,
        });
      }

      if (repTrips.size === 0) continue;

      const stopTimesText = readZipEntryText(store.zipEntries, 'stop_times.txt');
      if (!stopTimesText) continue;

      const lines = stopTimesText.split(/\r?\n/);
      const header = (lines[0] || '').replace(/^\uFEFF/, '').split(',');
      const tripIdx = header.indexOf('trip_id');
      const stopIdx = header.indexOf('stop_id');
      const seqIdx = header.indexOf('stop_sequence');
      if (tripIdx < 0 || stopIdx < 0) continue;

      const stopsByRepTrip = new Map<string, { seq: number; stopId: string }[]>();

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const firstComma = line.indexOf(',');
        if (firstComma < 0) continue;
        const cols = line.split(',');
        const tid = cols[tripIdx]?.trim();
        if (!tid || !repTrips.has(tid)) continue;
        const sid = cols[stopIdx]?.trim();
        if (!sid) continue;
        let arr = stopsByRepTrip.get(tid);
        if (!arr) {
          arr = [];
          stopsByRepTrip.set(tid, arr);
        }
        arr.push({
          seq: seqIdx >= 0 ? Number.parseInt(cols[seqIdx], 10) || i : i,
          stopId: sid,
        });
      }

      for (const [tid, meta] of repTrips.entries()) {
        const rawStops = stopsByRepTrip.get(tid);
        if (!rawStops || rawStops.length < 2) continue;
        rawStops.sort((a, b) => a.seq - b.seq);
        const orderedStops: BusStopPoint[] = [];
        for (const item of rawStops) {
          const s = store.stopsById.get(item.stopId);
          if (!s) continue;
          orderedStops.push({
            stopId: s.stopId,
            stopCode: s.stopCode,
            stopName: s.stopName,
            lat: s.lat,
            lon: s.lon,
            sequence: item.seq,
          });
          const key = stopKeyOf(s.stopName, s.lat, s.lon);
          let rset = routesByStopKey.get(key);
          if (!rset) {
            rset = new Set<string>();
            routesByStopKey.set(key, rset);
          }
          rset.add(meta.route.routeShortName);
        }
        if (orderedStops.length < 2) continue;
        patterns.push({
          patternId: `${category}:${meta.route.routeId}:${tid}`,
          category,
          routeId: meta.route.routeId,
          routeShortName: meta.route.routeShortName,
          routeLongName: meta.route.routeLongName,
          headsign: meta.headsign,
          color: meta.route.color,
          stops: orderedStops,
        });
      }
    }

    // Build deduplicated searchable stop directory enriched with serving route badges
    const seen = new Set<string>();
    const searchableStops: BusStopSearchItem[] = [];
    for (const [category, store] of this.busStaticStores.entries()) {
      for (const s of store.stopsById.values()) {
        const key = stopKeyOf(s.stopName, s.lat, s.lon);
        if (seen.has(key)) continue;
        seen.add(key);
        const routeNames = Array.from(routesByStopKey.get(key) || []).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        );
        searchableStops.push({
          stopId: s.stopId,
          stopCode: s.stopCode,
          stopName: s.stopName,
          category,
          lat: s.lat,
          lon: s.lon,
          routeNames: routeNames.slice(0, 6),
        });
      }
    }

    this.busPlannerIndex = {
      builtAt: Date.now(),
      patterns,
      searchableStops,
    };
    return this.busPlannerIndex;
  }

  public async searchBusStops(
    query: string,
    limit = 20,
    nearLat?: number,
    nearLon?: number
  ): Promise<BusStopSearchItem[]> {
    const index = await this.ensureBusPlannerIndex();
    const q = (query || '').trim().toLowerCase();

    if (!q) {
      if (Number.isFinite(nearLat) && Number.isFinite(nearLon)) {
        return [...index.searchableStops]
          .sort(
            (a, b) =>
              haversineMeters(nearLat!, nearLon!, a.lat, a.lon) -
              haversineMeters(nearLat!, nearLon!, b.lat, b.lon)
          )
          .slice(0, limit);
      }
      return [...index.searchableStops]
        .sort((a, b) => b.routeNames.length - a.routeNames.length)
        .slice(0, limit);
    }

    const scored: { item: BusStopSearchItem; score: number }[] = [];
    for (const item of index.searchableStops) {
      const nameL = item.stopName.toLowerCase();
      const codeL = item.stopCode.toLowerCase();
      const routeMatch = item.routeNames.some((r) => r.toLowerCase() === q);
      const nameIdx = nameL.indexOf(q);
      const codeMatch = codeL.includes(q);
      if (nameIdx < 0 && !codeMatch && !routeMatch) continue;

      let score = 0;
      if (nameIdx === 0) score += 100;
      else if (nameIdx > 0) score += 60;
      if (codeMatch) score += 80;
      if (routeMatch) score += 50;
      score += Math.min(20, item.routeNames.length * 3);
      scored.push({ item, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((x) => x.item);
  }

  public async planBusTrip(
    fromStop: BusStopSearchItem,
    toStop: BusStopSearchItem,
    liveVehicles: LiveBusVehicle[]
  ): Promise<BusTripPlanPayload> {
    const index = await this.ensureBusPlannerIndex();
    if (!index.patterns.length) {
      return { fromStop, toStop, options: [], staticReady: false };
    }

    const BOARD_RADIUS_M = 280;
    const ALIGHT_RADIUS_M = 300;
    const TRANSFER_RADIUS_M = 200;

    const findBestStopIndex = (
      stops: BusStopPoint[],
      targetLat: number,
      targetLon: number,
      targetStopId: string,
      maxRadiusM: number,
      minIdx = 0
    ): { idx: number; distM: number } | null => {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = minIdx; i < stops.length; i++) {
        const s = stops[i];
        const d =
          s.stopId === targetStopId ? 0 : haversineMeters(targetLat, targetLon, s.lat, s.lon);
        if (d <= maxRadiusM && d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return bestIdx >= 0 ? { idx: bestIdx, distM: Math.round(bestDist) } : null;
    };

    const computeAlongRouteKm = (stops: BusStopPoint[], fromIdx: number, toIdx: number): number => {
      let km = 0;
      for (let i = fromIdx + 1; i <= toIdx; i++) {
        km += haversineMeters(stops[i - 1].lat, stops[i - 1].lon, stops[i].lat, stops[i].lon) / 1000;
      }
      return Math.max(0.4, Math.round(km * 1.15 * 10) / 10);
    };

    const matchApproachingLiveBuses = (
      pattern: BusRoutePattern,
      boardIdx: number
    ): BusTripApproachingLive[] => {
      const routeVehicles = liveVehicles.filter(
        (v) =>
          v.category === pattern.category &&
          v.routeShortName.toUpperCase() === pattern.routeShortName.toUpperCase()
      );
      const approaching: BusTripApproachingLive[] = [];

      for (const v of routeVehicles) {
        const aligned = findDirectionAlignedStopIndex(pattern.stops, v);
        // Reject buses moving in the OPPOSITE direction (across the street) or off-corridor or already past origin stop
        if (aligned.isWrongDirection || aligned.distMeters > 500 || aligned.idx > boardIdx) {
          continue;
        }
        const closestIdx = aligned.idx;
        const stopsAway = boardIdx - closestIdx;
        const routeKm =
          stopsAway > 0
            ? computeAlongRouteKm(pattern.stops, closestIdx, boardIdx) + aligned.distMeters / 1000
            : aligned.distMeters / 1000;
        const effSpeed = v.speedKmh >= 8 ? v.speedKmh : 18;
        const waitMinutes = Math.max(
          1,
          Math.round((routeKm / effSpeed) * 60 + stopsAway * 0.45)
        );
        approaching.push({
          busId: v.id,
          licensePlate: v.licensePlate,
          speedKmh: v.speedKmh,
          waitMinutes,
          stopsAway,
          distanceMeters: Math.round(routeKm * 1000),
          updatedSecondsAgo: v.updatedSecondsAgo,
        });
      }

      approaching.sort((a, b) => a.waitMinutes - b.waitMinutes);
      return approaching.slice(0, 3);
    };

    const buildLeg = (
      pattern: BusRoutePattern,
      boardIdx: number,
      alightIdx: number
    ): BusTripLeg => {
      const stopCount = alightIdx - boardIdx;
      const distanceKm = computeAlongRouteKm(pattern.stops, boardIdx, alightIdx);
      const rideMinutes = Math.max(2, Math.round((distanceKm / 18) * 60 + stopCount * 0.45));
      const fare = estimateRapidKlBusFare(pattern.category, distanceKm);
      const approachingBuses = matchApproachingLiveBuses(pattern, boardIdx);
      const scheduledWaitMin = pattern.category === 'rapid-bus-mrtfeeder' ? 12 : 14;

      return {
        category: pattern.category,
        routeId: pattern.routeId,
        routeShortName: pattern.routeShortName,
        routeLongName: pattern.routeLongName,
        headsign: pattern.headsign,
        color: pattern.color,
        boardStop: pattern.stops[boardIdx],
        alightStop: pattern.stops[alightIdx],
        stopCount,
        distanceKm,
        rideMinutes,
        fareMyr: fare.cashlessMyr,
        isFlatRate: fare.isFlatRate,
        approachingBuses,
        scheduledWaitMin,
      };
    };

    // 1. Find ALL Direct Bus Options
    const directByRoute = new Map<string, BusTripOption>();
    const originPatterns: { pattern: BusRoutePattern; boardIdx: number; walkM: number }[] = [];
    const destPatterns: { pattern: BusRoutePattern; alightIdx: number; walkM: number }[] = [];

    for (const pattern of index.patterns) {
      const boardMatch = findBestStopIndex(
        pattern.stops,
        fromStop.lat,
        fromStop.lon,
        fromStop.stopId,
        BOARD_RADIUS_M,
        0
      );
      if (boardMatch) {
        originPatterns.push({ pattern, boardIdx: boardMatch.idx, walkM: boardMatch.distM });
        const alightMatch = findBestStopIndex(
          pattern.stops,
          toStop.lat,
          toStop.lon,
          toStop.stopId,
          ALIGHT_RADIUS_M,
          boardMatch.idx + 1
        );
        if (alightMatch) {
          const leg = buildLeg(pattern, boardMatch.idx, alightMatch.idx);
          const hasLiveBus = leg.approachingBuses.length > 0;
          const waitMinutes = hasLiveBus ? leg.approachingBuses[0].waitMinutes : leg.scheduledWaitMin;
          const walkMin = Math.round((boardMatch.distM + alightMatch.distM) / 78);
          const option: BusTripOption = {
            id: `direct:${pattern.category}:${pattern.routeShortName}`,
            legs: [leg],
            transferCount: 0,
            walkToBoardMeters: boardMatch.distM,
            walkFromAlightMeters: alightMatch.distM,
            waitMinutes,
            hasLiveBus,
            totalRideMinutes: leg.rideMinutes,
            totalMinutes: waitMinutes + leg.rideMinutes + walkMin,
            totalStops: leg.stopCount,
            totalDistanceKm: leg.distanceKm,
            totalFareMyr: leg.fareMyr,
          };

          const existing = directByRoute.get(option.id);
          if (!existing || option.totalMinutes < existing.totalMinutes) {
            directByRoute.set(option.id, option);
          }
        }
      }

      const anyDest = findBestStopIndex(
        pattern.stops,
        toStop.lat,
        toStop.lon,
        toStop.stopId,
        ALIGHT_RADIUS_M,
        1
      );
      if (anyDest) {
        destPatterns.push({ pattern, alightIdx: anyDest.idx, walkM: anyDest.distM });
      }
    }

    const options: BusTripOption[] = Array.from(directByRoute.values());

    // 2. If fewer than 3 direct options, also find smart 1-Transfer Bus Options!
    if (options.length < 3 && originPatterns.length > 0 && destPatterns.length > 0) {
      const transferByPair = new Map<string, BusTripOption>();

      // Cap candidate search for instant mobile performance
      const topOrigin = originPatterns.slice(0, 24);
      const topDest = destPatterns.slice(0, 24);

      for (const o of topOrigin) {
        for (const d of topDest) {
          if (
            o.pattern.category === d.pattern.category &&
            o.pattern.routeShortName === d.pattern.routeShortName
          ) {
            continue;
          }
          // Find closest meeting stop between o.pattern (after boardIdx) and d.pattern (before alightIdx)
          let bestTransfer: { oIdx: number; dIdx: number; distM: number } | null = null;
          for (let i = o.boardIdx + 1; i < o.pattern.stops.length; i++) {
            const os = o.pattern.stops[i];
            for (let j = 0; j < d.alightIdx; j++) {
              const ds = d.pattern.stops[j];
              const dm =
                os.stopId === ds.stopId ? 0 : haversineMeters(os.lat, os.lon, ds.lat, ds.lon);
              if (dm <= TRANSFER_RADIUS_M) {
                const totalStopsCandidate = i - o.boardIdx + (d.alightIdx - j);
                if (
                  !bestTransfer ||
                  totalStopsCandidate <
                    bestTransfer.oIdx - o.boardIdx + (d.alightIdx - bestTransfer.dIdx)
                ) {
                  bestTransfer = { oIdx: i, dIdx: j, distM: Math.round(dm) };
                }
              }
            }
          }

          if (!bestTransfer) continue;
          const leg1 = buildLeg(o.pattern, o.boardIdx, bestTransfer.oIdx);
          const leg2 = buildLeg(d.pattern, bestTransfer.dIdx, d.alightIdx);
          const hasLiveBus = leg1.approachingBuses.length > 0;
          const wait1 = hasLiveBus ? leg1.approachingBuses[0].waitMinutes : leg1.scheduledWaitMin;
          const transferWait = 8;
          const walkMin = Math.round((o.walkM + d.walkM + bestTransfer.distM) / 78);
          const totalRideMinutes = leg1.rideMinutes + leg2.rideMinutes;
          const pairKey = `xfer:${leg1.routeShortName}->${leg2.routeShortName}`;

          const opt: BusTripOption = {
            id: pairKey,
            legs: [leg1, leg2],
            transferCount: 1,
            walkToBoardMeters: o.walkM,
            walkFromAlightMeters: d.walkM,
            waitMinutes: wait1,
            hasLiveBus,
            totalRideMinutes,
            totalMinutes: wait1 + transferWait + totalRideMinutes + walkMin,
            totalStops: leg1.stopCount + leg2.stopCount,
            totalDistanceKm: Math.round((leg1.distanceKm + leg2.distanceKm) * 10) / 10,
            totalFareMyr: Math.round((leg1.fareMyr + leg2.fareMyr) * 100) / 100,
          };

          const prev = transferByPair.get(pairKey);
          if (!prev || opt.totalMinutes < prev.totalMinutes) {
            transferByPair.set(pairKey, opt);
          }
        }
      }

      const bestTransfers = Array.from(transferByPair.values())
        .sort((a, b) => {
          if (a.hasLiveBus !== b.hasLiveBus) return a.hasLiveBus ? -1 : 1;
          return a.totalMinutes - b.totalMinutes;
        })
        .slice(0, 4);

      options.push(...bestTransfers);
    }

    // Final ranking: Direct first, then live approaching bus first, then shortest total time
    options.sort((a, b) => {
      if (a.transferCount !== b.transferCount) return a.transferCount - b.transferCount;
      if (a.hasLiveBus !== b.hasLiveBus) return a.hasLiveBus ? -1 : 1;
      return a.totalMinutes - b.totalMinutes;
    });

    return {
      fromStop,
      toStop,
      options: options.slice(0, 6),
      staticReady: true,
    };
  }

  /**
   * Computes the top N (default 3) closest approaching live buses of DIFFERENT route numbers
   * that are verified to serve My Bus Station on the EXACT SAME direction / side of the road.
   */
  public async getMyBusStationArrivals(
    myStation: MyBusStation,
    liveVehicles: LiveBusVehicle[],
    maxRoutes = 3
  ): Promise<MyBusStationArrival[]> {
    if (!myStation || !liveVehicles.length) return [];
    const index = await this.ensureBusPlannerIndex();
    if (!index.patterns.length) return [];

    const bestByRoute = new Map<string, MyBusStationArrival>();

    for (const pattern of index.patterns) {
      const myIdx = findMyBusStationIndexInStops(pattern.stops, myStation, 0);
      if (myIdx < 0) continue;

      const routeVehicles = liveVehicles.filter(
        (v) =>
          v.category === pattern.category &&
          v.routeShortName.toUpperCase() === pattern.routeShortName.toUpperCase()
      );

      for (const v of routeVehicles) {
        const aligned = findDirectionAlignedStopIndex(pattern.stops, v);
        // Reject buses moving opposite to this direction (across the road) or off-corridor
        if (aligned.isWrongDirection || aligned.distMeters > 450) continue;

        const directToStationM = haversineMeters(v.lat, v.lon, myStation.lat, myStation.lon);
        // Reject buses that have already passed My Bus Station (with 90m GPS-jitter grace at the stop itself)
        if (aligned.idx > myIdx && directToStationM > 90) continue;

        const stopsAway = Math.max(0, myIdx - aligned.idx);
        let alongKm = 0;
        for (let i = aligned.idx + 1; i <= myIdx; i++) {
          alongKm +=
            haversineMeters(
              pattern.stops[i - 1].lat,
              pattern.stops[i - 1].lon,
              pattern.stops[i].lat,
              pattern.stops[i].lon
            ) / 1000;
        }
        const routeKm =
          stopsAway > 0 ? Math.max(directToStationM / 1000, alongKm * 1.15) : directToStationM / 1000;
        const effSpeed = v.speedKmh >= 8 ? v.speedKmh : 18;
        const etaMinutes = Math.max(
          1,
          Math.round((routeKm / effSpeed) * 60 + stopsAway * 0.45)
        );
        const isArrivingNow = stopsAway === 0 && directToStationM <= 150;

        const routeKey = pattern.routeShortName.toUpperCase();
        const candidate: MyBusStationArrival = {
          bus: v,
          routeShortName: pattern.routeShortName,
          routeLongName: pattern.routeLongName,
          headsign: pattern.headsign,
          category: pattern.category,
          color: pattern.color,
          stopsAway,
          distanceMeters: Math.round(routeKm * 1000),
          etaMinutes,
          isArrivingNow,
        };

        // Keep ONLY the 1 single closest approaching bus per route number!
        const prev = bestByRoute.get(routeKey);
        if (
          !prev ||
          candidate.etaMinutes < prev.etaMinutes ||
          (candidate.etaMinutes === prev.etaMinutes &&
            candidate.distanceMeters < prev.distanceMeters)
        ) {
          bestByRoute.set(routeKey, candidate);
        }
      }
    }

    return Array.from(bestByRoute.values())
      .sort((a, b) => {
        if (a.etaMinutes !== b.etaMinutes) return a.etaMinutes - b.etaMinutes;
        return a.distanceMeters - b.distanceMeters;
      })
      .slice(0, maxRoutes);
  }
}

export const clientGtfsService = new ClientGtfsService();
