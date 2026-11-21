import { useCallback, useState } from 'react';
import type { BusCategory } from '../types/transit';
import { haversineKm, normalizeSearch } from '../utils/transitHelpers';

export interface MyBusStation {
  stopId: string;
  stopCode: string;
  stopName: string;
  lat: number;
  lon: number;
  category?: BusCategory;
}

export interface MyRailStation {
  stopId: string;
  displayName: string;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeColor: string;
  category: string;
  lat: number;
  lon: number;
}

const BUS_STORAGE_KEY = 'kl_transit_my_bus_station_v1';
const RAIL_STORAGE_KEY = 'kl_transit_my_rail_station_v1';

function readMyBusStation(): MyBusStation | null {
  try {
    const raw = window.localStorage.getItem(BUS_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<MyBusStation>;
    if (
      p &&
      typeof p.stopName === 'string' &&
      typeof p.lat === 'number' &&
      typeof p.lon === 'number' &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon)
    ) {
      return {
        stopId: p.stopId || '',
        stopCode: p.stopCode || '',
        stopName: p.stopName,
        lat: p.lat,
        lon: p.lon,
        category: p.category,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function readMyRailStation(): MyRailStation | null {
  try {
    const raw = window.localStorage.getItem(RAIL_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<MyRailStation>;
    if (p && typeof p.stopId === 'string' && typeof p.displayName === 'string') {
      return {
        stopId: p.stopId,
        displayName: p.displayName,
        routeId: p.routeId || '',
        routeShortName: p.routeShortName || '',
        routeLongName: p.routeLongName || '',
        routeColor: p.routeColor || '#047857',
        category: p.category || 'MRT',
        lat: typeof p.lat === 'number' ? p.lat : 3.1478,
        lon: typeof p.lon === 'number' ? p.lon : 101.6953,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Strict direction-safe matcher for My Bus Station:
 * 1. Exact stopId match (strongest — distinguishes opposite sides of the same road!)
 * 2. Exact stopCode match (when stopCode is non-empty)
 * 3. Very tight proximity (< 35m) AND identical normalized stop name (avoids matching opposite-side stops!)
 */
export function matchesMyBusStationStrict(
  stop: { stopId?: string; stopCode?: string; stopName: string; lat: number; lon: number },
  myStation: MyBusStation | null
): boolean {
  if (!myStation) return false;
  if (myStation.stopId && stop.stopId && myStation.stopId === stop.stopId) return true;
  if (myStation.stopCode && stop.stopCode && myStation.stopCode === stop.stopCode) return true;
  if (Number.isFinite(stop.lat) && Number.isFinite(stop.lon)) {
    const distM = haversineKm(stop.lat, stop.lon, myStation.lat, myStation.lon) * 1000;
    const sameName =
      normalizeSearch(myStation.stopName) !== '' &&
      normalizeSearch(myStation.stopName) === normalizeSearch(stop.stopName);
    // Same exact side of road only (<= 28m with same name, prevents opposite-street false matches)
    if (sameName && distM <= 28) return true;
  }
  return false;
}

/**
 * Finds the exact index of myStation inside an ordered trip stop list, preferring exact stopId/stopCode
 * before falling back to tight same-side-of-road matching.
 */
export function findMyBusStationIndexInStops(
  stops: { stopId: string; stopCode: string; stopName: string; lat: number; lon: number }[],
  myStation: MyBusStation | null,
  startFromIdx = 0
): number {
  if (!myStation || !stops.length) return -1;

  // Pass 1: Exact stopId (guarantees exact physical side of road)
  if (myStation.stopId) {
    for (let i = startFromIdx; i < stops.length; i++) {
      if (stops[i].stopId === myStation.stopId) return i;
    }
    for (let i = 0; i < startFromIdx; i++) {
      if (stops[i].stopId === myStation.stopId) return i;
    }
  }

  // Pass 2: Exact stopCode
  if (myStation.stopCode) {
    for (let i = startFromIdx; i < stops.length; i++) {
      if (stops[i].stopCode && stops[i].stopCode === myStation.stopCode) return i;
    }
    for (let i = 0; i < startFromIdx; i++) {
      if (stops[i].stopCode && stops[i].stopCode === myStation.stopCode) return i;
    }
  }

  // Pass 3: Tight same-side match (same name AND <= 28m)
  for (let i = startFromIdx; i < stops.length; i++) {
    if (matchesMyBusStationStrict(stops[i], myStation)) return i;
  }
  for (let i = 0; i < startFromIdx; i++) {
    if (matchesMyBusStationStrict(stops[i], myStation)) return i;
  }

  return -1;
}

export function useMyStations() {
  const [myBusStation, setMyBusStationState] = useState<MyBusStation | null>(readMyBusStation);
  const [myRailStation, setMyRailStationState] = useState<MyRailStation | null>(readMyRailStation);

  const setMyBusStation = useCallback((station: MyBusStation | null) => {
    setMyBusStationState(station);
    try {
      if (station) window.localStorage.setItem(BUS_STORAGE_KEY, JSON.stringify(station));
      else window.localStorage.removeItem(BUS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const setMyRailStation = useCallback((station: MyRailStation | null) => {
    setMyRailStationState(station);
    try {
      if (station) window.localStorage.setItem(RAIL_STORAGE_KEY, JSON.stringify(station));
      else window.localStorage.removeItem(RAIL_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return {
    myBusStation,
    setMyBusStation,
    myRailStation,
    setMyRailStation,
  };
}
