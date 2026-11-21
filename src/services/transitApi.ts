import { Capacitor } from '@capacitor/core';
import type { MyBusStation } from '../hooks/useMyStations';
import type {
  BusCategory,
  BusRouteDetailPayload,
  BusStopSearchItem,
  BusTripPlanPayload,
  LiveBusesPayload,
  LiveBusVehicle,
  MyBusStationArrival,
  NearbyTransitPayload,
  RailNetworkPayload,
  StationDeparturePayload,
} from '../types/transit';
import { clientGtfsService } from './clientGtfsService';

async function fetchBackendJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Backend JSON API unavailable');
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error((json as { error?: string }).error || `HTTP ${res.status}`);
  }
  return json as T;
}

export const transitApi = {
  async getRailNetwork(): Promise<RailNetworkPayload> {
    if (Capacitor.isNativePlatform()) {
      return clientGtfsService.getRailNetwork();
    }
    try {
      return await fetchBackendJson<RailNetworkPayload>('/api/transit/rail');
    } catch {
      return clientGtfsService.getRailNetwork();
    }
  },

  async getStationDepartures(
    stopId: string,
    time: string,
    day: 'auto' | 'weekday' | 'sat' | 'sun'
  ): Promise<StationDeparturePayload> {
    if (Capacitor.isNativePlatform()) {
      const payload = await clientGtfsService.getStationDepartures(stopId, {
        time: time || undefined,
        day: day !== 'auto' ? day : undefined,
      });
      if (!payload) throw new Error(`Không tìm thấy ga với mã "${stopId}".`);
      return payload;
    }
    const params = new URLSearchParams();
    if (time) params.set('time', time);
    if (day !== 'auto') params.set('day', day);
    const qs = params.toString();
    try {
      return await fetchBackendJson<StationDeparturePayload>(
        `/api/transit/station/${encodeURIComponent(stopId)}/departures${qs ? `?${qs}` : ''}`
      );
    } catch {
      const payload = await clientGtfsService.getStationDepartures(stopId, {
        time: time || undefined,
        day: day !== 'auto' ? day : undefined,
      });
      if (!payload) throw new Error(`Không tìm thấy ga với mã "${stopId}".`);
      return payload;
    }
  },

  async getLiveBuses(force = false, priorityCategory?: BusCategory): Promise<LiveBusesPayload> {
    if (Capacitor.isNativePlatform()) {
      return clientGtfsService.getLiveBuses({ force, priorityCategory });
    }
    const params = new URLSearchParams();
    if (force) params.set('force', '1');
    const qs = params.toString();
    try {
      return await fetchBackendJson<LiveBusesPayload>(
        `/api/transit/buses/live${qs ? `?${qs}` : ''}`
      );
    } catch {
      return clientGtfsService.getLiveBuses({ force, priorityCategory });
    }
  },

  async getBusRouteDetail(
    category: BusCategory,
    routeIdOrCode: string,
    tripId?: string
  ): Promise<BusRouteDetailPayload | null> {
    if (Capacitor.isNativePlatform()) {
      return clientGtfsService.getBusRouteDetail(category, routeIdOrCode, tripId);
    }
    const params = new URLSearchParams();
    if (tripId) params.set('tripId', tripId);
    const qs = params.toString();
    try {
      return await fetchBackendJson<BusRouteDetailPayload>(
        `/api/transit/buses/route/${encodeURIComponent(category)}/${encodeURIComponent(
          routeIdOrCode
        )}${qs ? `?${qs}` : ''}`
      );
    } catch {
      return clientGtfsService.getBusRouteDetail(category, routeIdOrCode, tripId);
    }
  },

  async getNearbyTransit(lat: number, lon: number, limit = 6): Promise<NearbyTransitPayload> {
    if (Capacitor.isNativePlatform()) {
      return clientGtfsService.getNearbyTransit(lat, lon, limit);
    }
    try {
      return await fetchBackendJson<NearbyTransitPayload>(
        `/api/transit/nearby?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&limit=${limit}`
      );
    } catch {
      return clientGtfsService.getNearbyTransit(lat, lon, limit);
    }
  },

  async searchBusStops(
    query: string,
    limit = 20,
    nearLat?: number,
    nearLon?: number
  ): Promise<BusStopSearchItem[]> {
    return clientGtfsService.searchBusStops(query, limit, nearLat, nearLon);
  },

  async planBusTrip(
    fromStop: BusStopSearchItem,
    toStop: BusStopSearchItem,
    liveVehicles: LiveBusVehicle[]
  ): Promise<BusTripPlanPayload> {
    return clientGtfsService.planBusTrip(fromStop, toStop, liveVehicles);
  },

  async getMyBusStationArrivals(
    myStation: MyBusStation,
    liveVehicles: LiveBusVehicle[],
    maxRoutes = 3
  ): Promise<MyBusStationArrival[]> {
    return clientGtfsService.getMyBusStationArrivals(myStation, liveVehicles, maxRoutes);
  },
};
