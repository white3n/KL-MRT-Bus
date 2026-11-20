export type TransitMode = 'rail' | 'bus' | 'all';

export type RailCategory = 'MRT' | 'LRT' | 'MRL' | 'BRT';

export type BusCategory = 'rapid-bus-kl' | 'rapid-bus-mrtfeeder';

export interface RailLine {
  routeId: string;
  shortName: string;
  longName: string;
  desc: string;
  category: RailCategory;
  color: string;
  textColor: string;
  stationCount: number;
  shapePoints: [number, number][];
}

export interface InterchangeRef {
  stopId: string;
  stopName: string;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeColor: string;
  category: RailCategory;
}

export interface RailStation {
  stopId: string;
  stopName: string;
  displayName: string;
  lat: number;
  lon: number;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeColor: string;
  category: RailCategory;
  sequence: number;
  isOku: boolean;
  interchanges: InterchangeRef[];
}

export interface RailNetworkPayload {
  lines: RailLine[];
  stations: RailStation[];
  serverTimeMyt: string;
  serverDateMyt: string;
  dayType: 'MonFri' | 'Sat' | 'Sun';
  source: string;
  lastSyncedAt: string;
}

export interface UpcomingTrain {
  arrivalTime: string;
  secondsAway: number;
  minutesAway: number;
  headwayMinutes: number;
  isPeak: boolean;
  isTomorrow: boolean;
  status: 'arriving' | 'soon' | 'scheduled' | 'tomorrow';
}

export interface DirectionDepartures {
  directionId: string;
  tripId: string;
  headsign: string;
  destinationName: string;
  originName: string;
  nextStopName: string | null;
  nextStopMinutes: number | null;
  firstTrain: string;
  lastTrain: string;
  currentHeadwayMinutes: number;
  isPeakNow: boolean;
  serviceActive: boolean;
  upcoming: UpcomingTrain[];
}

export interface StationDeparturePayload {
  station: RailStation;
  queryTimeMyt: string;
  isLiveTime: boolean;
  dayType: 'MonFri' | 'Sat' | 'Sun';
  directions: DirectionDepartures[];
  lineStations: {
    stopId: string;
    displayName: string;
    sequence: number;
    isCurrent: boolean;
  }[];
  dataNotice: string;
}

export interface LiveBusVehicle {
  id: string;
  vehicleId: string;
  licensePlate: string;
  category: BusCategory;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  tripId: string;
  lat: number;
  lon: number;
  bearing: number;
  speedKmh: number;
  timestamp: number;
  updatedSecondsAgo: number;
  color: string;
}

export interface BusRouteSummary {
  routeKey: string;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  category: BusCategory;
  activeBusCount: number;
  color: string;
}

export interface LiveBusesPayload {
  vehicles: LiveBusVehicle[];
  routes: BusRouteSummary[];
  counts: {
    total: number;
    rapidBusKl: number;
    mrtFeeder: number;
  };
  fetchedAt: string;
  serverTimeMyt: string;
  staticReady: boolean;
  staleWarning?: string;
}

export interface BusStopPoint {
  stopId: string;
  stopCode: string;
  stopName: string;
  lat: number;
  lon: number;
  sequence: number;
}

export interface BusRouteDetailPayload {
  route: BusRouteSummary;
  shapePoints: [number, number][];
  stops: BusStopPoint[];
  vehicles: LiveBusVehicle[];
}

export interface UserLocation {
  lat: number;
  lon: number;
  accuracyMeters: number;
  timestamp: number;
}

export interface NearbyRailStation {
  stopId: string;
  displayName: string;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeColor: string;
  category: RailCategory;
  lat: number;
  lon: number;
  distanceMeters: number;
  walkMinutes: number;
}

export interface NearbyBusStop {
  stopId: string;
  stopCode: string;
  stopName: string;
  category: BusCategory;
  lat: number;
  lon: number;
  distanceMeters: number;
  walkMinutes: number;
}

export interface NearbyTransitPayload {
  lat: number;
  lon: number;
  distanceToKlCenterKm: number;
  railStations: NearbyRailStation[];
  busStops: NearbyBusStop[];
  busStopsLoaded: boolean;
}
