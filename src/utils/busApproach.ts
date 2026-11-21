import type { LiveBusVehicle, UserLocation } from '../types/transit';
import { haversineKm } from './transitHelpers';

export interface ApproachingBusItem {
  bus: LiveBusVehicle;
  distanceMeters: number;
  roadDistanceKm: number;
  etaMinutes: number;
  isApproaching: boolean;
  headingDeltaDeg: number;
}

/**
 * Smallest angular difference (0..180 deg) between two compass bearings.
 */
export function angleDiffDeg(a: number, b: number): number {
  const diff = Math.abs((((a % 360) + 360) % 360) - (((b % 360) + 360) % 360));
  return Math.min(diff, 360 - diff);
}

/**
 * Direction-aware stop matching for loop & two-way bus routes.
 * Combines physical distance with route-tangent vs bus-heading alignment so
 * buses on the OPPOSITE side of a road or return half of a loop never cause
 * false "arriving" or oscillating "already passed" jitter.
 */
export function findDirectionAlignedStopIndex(
  stops: { lat: number; lon: number }[],
  bus: { lat: number; lon: number; bearing: number; speedKmh: number }
): { idx: number; distMeters: number; headingDeltaDeg: number; isWrongDirection: boolean } {
  if (!stops.length) {
    return { idx: 0, distMeters: Infinity, headingDeltaDeg: 0, isWrongDirection: true };
  }

  let bestIdx = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestDistM = Number.POSITIVE_INFINITY;
  let bestHeadingDelta = 0;

  const hasReliableHeading = bus.speedKmh >= 4 && Number.isFinite(bus.bearing);

  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const distM = haversineKm(bus.lat, bus.lon, s.lat, s.lon) * 1000;

    // Local forward tangent of the route at stop i
    let segBearing = bus.bearing;
    if (i < stops.length - 1) {
      segBearing = bearingBetweenDeg(s.lat, s.lon, stops[i + 1].lat, stops[i + 1].lon);
    } else if (i > 0) {
      segBearing = bearingBetweenDeg(stops[i - 1].lat, stops[i - 1].lon, s.lat, s.lon);
    }

    const delta = hasReliableHeading ? angleDiffDeg(bus.bearing, segBearing) : 0;
    // Heavy penalty if bus is moving opposite to this half of the route
    const directionPenalty =
      !hasReliableHeading ? 0 : delta <= 65 ? 0 : delta <= 100 ? 180 : 750;
    const score = distM + directionPenalty;

    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
      bestDistM = distM;
      bestHeadingDelta = delta;
    }
  }

  const isWrongDirection = hasReliableHeading && bestHeadingDelta > 105;
  return {
    idx: bestIdx,
    distMeters: Math.round(bestDistM),
    headingDeltaDeg: Math.round(bestHeadingDelta),
    isWrongDirection,
  };
}

/**
 * Initial compass bearing (0..360 deg) from point A to point B.
 */
export function bearingBetweenDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Finds the closest live buses approaching the user's current GPS position along their route,
 * ranking buses heading directly toward the user first, then closest ETA / distance.
 */
export function computeApproachingBuses(
  origin: { lat: number; lon: number } | null,
  vehicles: LiveBusVehicle[],
  limit = 6
): ApproachingBusItem[] {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon) || !vehicles.length) {
    return [];
  }

  const scored: ApproachingBusItem[] = [];

  for (const bus of vehicles) {
    if (!Number.isFinite(bus.lat) || !Number.isFinite(bus.lon)) continue;
    const distKm = haversineKm(bus.lat, bus.lon, origin.lat, origin.lon);
    if (distKm > 15) continue;

    const bearingToTarget = bearingBetweenDeg(bus.lat, bus.lon, origin.lat, origin.lon);
    const rawDiff = Math.abs(bearingToTarget - bus.bearing);
    const headingDeltaDeg = Math.min(rawDiff, 360 - rawDiff);

    // Bus is considered approaching if its heading aligns within 68 deg toward the target
    // OR it is already very close (< 350m)
    const isApproaching = headingDeltaDeg <= 68 || distKm <= 0.35;

    const roadDistanceKm = distKm * 1.25;
    const effectiveSpeedKmh = bus.speedKmh >= 8 ? bus.speedKmh : 20;
    const etaMinutes = Math.max(1, Math.round((roadDistanceKm / effectiveSpeedKmh) * 60));

    scored.push({
      bus,
      distanceMeters: Math.round(distKm * 1000),
      roadDistanceKm,
      etaMinutes,
      isApproaching,
      headingDeltaDeg: Math.round(headingDeltaDeg),
    });
  }

  // Sort: approaching buses first, then shortest distance / ETA
  scored.sort((a, b) => {
    if (a.isApproaching !== b.isApproaching) return a.isApproaching ? -1 : 1;
    return a.distanceMeters - b.distanceMeters;
  });

  return scored.slice(0, limit);
}

/**
 * Gently dead-reckons live moving buses between GTFS-RT polls (capped at <=10s and <=110m)
 * so map markers glide smoothly at 1s real-time cadence without drifting off-road.
 */
export function interpolateLiveVehicles(
  vehicles: LiveBusVehicle[],
  fetchedAtMs: number,
  nowMs: number
): LiveBusVehicle[] {
  const elapsedSinceFetchSec = Math.max(0, (nowMs - fetchedAtMs) / 1000);
  const motionSec = Math.min(10, elapsedSinceFetchSec);
  const nowSec = Math.floor(nowMs / 1000);

  return vehicles.map((bus) => {
    const updatedSecondsAgo =
      bus.timestamp > 0
        ? Math.max(0, nowSec - bus.timestamp)
        : Math.round(bus.updatedSecondsAgo + elapsedSinceFetchSec);

    if (bus.speedKmh < 5 || motionSec <= 0.4) {
      return { ...bus, updatedSecondsAgo };
    }

    // Distance moved in meters along current bearing (capped to 110m safety bound)
    const speedMps = (bus.speedKmh * 1000) / 3600;
    const moveMeters = Math.min(110, speedMps * motionSec * 0.75);
    const bearingRad = (bus.bearing * Math.PI) / 180;
    const dLat = (moveMeters * Math.cos(bearingRad)) / 111_320;
    const cosLat = Math.max(0.2, Math.cos((bus.lat * Math.PI) / 180));
    const dLon = (moveMeters * Math.sin(bearingRad)) / (111_320 * cosLat);

    return {
      ...bus,
      lat: bus.lat + dLat,
      lon: bus.lon + dLon,
      updatedSecondsAgo,
    };
  });
}

export function isValidUserLocation(loc: UserLocation | null): loc is UserLocation {
  return !!loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lon);
}
