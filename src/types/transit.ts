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
  scheduleMode?: 'timetable' | 'frequency';
  gtfsSyncedAt?: string;
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

export interface BusStopSearchItem {
  stopId: string;
  stopCode: string;
  stopName: string;
  category: BusCategory;
  lat: number;
  lon: number;
  routeNames: string[];
}

export interface BusTripApproachingLive {
  busId: string;
  licensePlate: string;
  speedKmh: number;
  waitMinutes: number;
  stopsAway: number;
  distanceMeters: number;
  updatedSecondsAgo: number;
}

export interface BusTripLeg {
  category: BusCategory;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  color: string;
  boardStop: BusStopPoint;
  alightStop: BusStopPoint;
  stopCount: number;
  distanceKm: number;
  rideMinutes: number;
  fareMyr: number;
  isFlatRate: boolean;
  approachingBuses: BusTripApproachingLive[];
  scheduledWaitMin: number;
}

export interface BusTripOption {
  id: string;
  legs: BusTripLeg[];
  transferCount: number;
  walkToBoardMeters: number;
  walkFromAlightMeters: number;
  waitMinutes: number;
  hasLiveBus: boolean;
  totalRideMinutes: number;
  totalMinutes: number;
  totalStops: number;
  totalDistanceKm: number;
  totalFareMyr: number;
}

export interface BusTripPlanPayload {
  fromStop: BusStopSearchItem;
  toStop: BusStopSearchItem;
  options: BusTripOption[];
  staticReady: boolean;
}

export interface MyBusStationArrival {
  bus: LiveBusVehicle;
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  category: BusCategory;
  color: string;
  stopsAway: number;
  distanceMeters: number;
  etaMinutes: number;
  isArrivingNow: boolean;
}
