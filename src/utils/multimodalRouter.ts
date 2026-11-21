import type { KlPlaceResult } from '../services/placeSearch';
import { transitApi } from '../services/transitApi';
import type { LiveBusVehicle, RailLine, RailStation } from '../types/transit';
import { estimateRapidKlBusFare } from './fareCalculator';
import { planRailTrip } from './railRouter';
import { haversineKm } from './transitHelpers';

export interface JourneyWalkLeg {
  kind: 'walk';
  fromName: string;
  toName: string;
  distanceMeters: number;
  minutes: number;
}

export interface JourneyRailLeg {
  kind: 'rail';
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeColor: string;
  category: string;
  directionName: string;
  boardStation: RailStation;
  alightStation: RailStation;
  intermediateStations: string[];
  stopCount: number;
  rideMinutes: number;
  waitMinutes: number;
  upcomingWaits: { minutesAway: number; arrivalTime: string }[];
  isScheduled: true;
}

export interface JourneyBusLeg {
  kind: 'bus';
  routeShortName: string;
  routeLongName: string;
  headsign: string;
  color: string;
  category: 'rapid-bus-kl' | 'rapid-bus-mrtfeeder';
  boardStopName: string;
  boardStopLat: number;
  boardStopLon: number;
  alightStopName: string;
  alightStopLat: number;
  alightStopLon: number;
  stopCount: number;
  rideMinutes: number;
  waitMinutes: number;
  upcomingWaits: { minutesAway: number; isLive: boolean; busId?: string }[];
  isLive: boolean;
  liveBusId?: string;
}

export type JourneyLeg = JourneyWalkLeg | JourneyRailLeg | JourneyBusLeg;

export interface MultimodalJourneyOption {
  id: string;
  legs: JourneyLeg[];
  totalMinutes: number;
  leaveInMinutes: number;
  fareMyr: number;
  primaryColor: string;
  primaryKind: 'rail' | 'feeder' | 'rapid-bus';
  primaryRouteId?: string;
  hasLiveBus: boolean;
}

export interface MultimodalPlanResult {
  origin: KlPlaceResult;
  destination: KlPlaceResult;
  options: MultimodalJourneyOption[];
  directWalkMinutes: number;
  directWalkMeters: number;
  directBikeMinutes: number;
}

function calcWalk(lat1: number, lon1: number, lat2: number, lon2: number): {
  meters: number;
  minutes: number;
} {
  const straightM = Math.round(haversineKm(lat1, lon1, lat2, lon2) * 1000);
  const roadM = Math.round(straightM * 1.24);
  const minutes = Math.max(1, Math.round(roadM / 76)); // ~4.6 km/h urban KL walking pace
  return { meters: roadM, minutes };
}

export async function planMultimodalJourney(params: {
  origin: KlPlaceResult;
  destination: KlPlaceResult;
  railStations: RailStation[];
  railLines: RailLine[];
  liveVehicles: LiveBusVehicle[];
}): Promise<MultimodalPlanResult> {
  const { origin, destination, railStations, railLines, liveVehicles } = params;
  const directWalk = calcWalk(origin.lat, origin.lon, destination.lat, destination.lon);
  const directBikeMinutes = Math.max(2, Math.round(directWalk.meters / 230));

  const options: MultimodalJourneyOption[] = [];

  // ---- 1. Find nearest Rail stations to Origin & Destination ----
  const railByOrigin = railStations
    .map((s) => ({ station: s, distKm: haversineKm(origin.lat, origin.lon, s.lat, s.lon) }))
    .sort((a, b) => a.distKm - b.distKm);

  const railByDest = railStations
    .map((s) => ({ station: s, distKm: haversineKm(destination.lat, destination.lon, s.lat, s.lon) }))
    .sort((a, b) => a.distKm - b.distKm);

  const nearOriginRail = railByOrigin.filter((x) => x.distKm <= 2.4).slice(0, 2);
  const nearDestRail = railByDest.filter((x) => x.distKm <= 2.4).slice(0, 2);

  // Deduplicate by line pair
  const triedRailPairs = new Set<string>();
  for (const oRail of nearOriginRail) {
    for (const dRail of nearDestRail) {
      if (oRail.station.stopId === dRail.station.stopId) continue;
      const pairKey = `${oRail.station.routeId}:${dRail.station.routeId}`;
      if (triedRailPairs.has(pairKey)) continue;
      triedRailPairs.add(pairKey);

      const railPlan = planRailTrip(
        oRail.station.stopId,
        dRail.station.stopId,
        railLines,
        railStations
      );
      if (!railPlan || railPlan.legs.length === 0) continue;

      const walk1 = calcWalk(origin.lat, origin.lon, oRail.station.lat, oRail.station.lon);
      const walk2 = calcWalk(dRail.station.lat, dRail.station.lon, destination.lat, destination.lon);

      // Fetch real GTFS departure schedule for each rail leg's boarding station
      const legs: JourneyLeg[] = [];
      if (walk1.meters >= 60) {
        legs.push({
          kind: 'walk',
          fromName: origin.name,
          toName: oRail.station.displayName,
          distanceMeters: walk1.meters,
          minutes: walk1.minutes,
        });
      }

      let firstWaitMin = 5;
      let totalRide = 0;

      for (let li = 0; li < railPlan.legs.length; li++) {
        const rl = railPlan.legs[li];
        const boardSt = rl.fromStation;
        const alightSt = rl.toStation;
        let waitMin = 6;
        let directionName = alightSt.displayName;
        let upcomingWaits: { minutesAway: number; arrivalTime: string }[] = [
          { minutesAway: 5, arrivalTime: '' },
          { minutesAway: 15, arrivalTime: '' },
          { minutesAway: 25, arrivalTime: '' },
        ];

        try {
          const dep = await transitApi.getStationDepartures(boardSt.stopId, '', 'auto');
          const nextStopName = rl.stops[1]?.displayName?.toLowerCase();
          const matchedDir =
            dep.directions.find(
              (d) => nextStopName && d.nextStopName?.toLowerCase() === nextStopName
            ) || dep.directions[0];
          if (matchedDir && matchedDir.upcoming.length > 0) {
            directionName = matchedDir.destinationName;
            // Pick first train reachable after walking (for leg 0) or transfer
            const minCatch = li === 0 ? walk1.minutes : 2;
            const catchable = matchedDir.upcoming.filter(
              (u) => !u.isTomorrow && u.minutesAway >= minCatch
            );
            const list = catchable.length > 0 ? catchable : matchedDir.upcoming;
            waitMin = Math.max(1, list[0].minutesAway - (li === 0 ? walk1.minutes : 0));
            upcomingWaits = list.slice(0, 3).map((u) => ({
              minutesAway: u.minutesAway,
              arrivalTime: u.arrivalTime,
            }));
          }
        } catch {
          // fallback defaults
        }

        if (li === 0) firstWaitMin = waitMin;
        totalRide += rl.estimatedMinutes;

        if (li > 0) {
          legs.push({
            kind: 'walk',
            fromName: railPlan.legs[li - 1].toStation.displayName,
            toName: boardSt.displayName,
            distanceMeters: 120,
            minutes: 3,
          });
        }

        legs.push({
          kind: 'rail',
          routeId: rl.routeId,
          routeShortName: rl.routeShortName,
          routeLongName: rl.routeLongName,
          routeColor: rl.routeColor,
          category: rl.category,
          directionName,
          boardStation: boardSt,
          alightStation: alightSt,
          intermediateStations: rl.stops.slice(1, -1).map((s) => s.displayName),
          stopCount: rl.stopCount,
          rideMinutes: rl.estimatedMinutes,
          waitMinutes: waitMin,
          upcomingWaits,
          isScheduled: true,
        });
      }

      if (walk2.meters >= 60) {
        legs.push({
          kind: 'walk',
          fromName: dRail.station.displayName,
          toName: destination.name,
          distanceMeters: walk2.meters,
          minutes: walk2.minutes,
        });
      }

      const fare = railPlan.fare;
      const transferWalk = Math.max(0, railPlan.legs.length - 1) * 4;
      const totalMinutes =
        (walk1.meters >= 60 ? walk1.minutes : 0) +
        totalRide +
        transferWalk +
        (walk2.meters >= 60 ? walk2.minutes : 0);

      const firstRailLeg = railPlan.legs[0];
      options.push({
        id: `rail:${oRail.station.stopId}->${dRail.station.stopId}`,
        legs,
        totalMinutes: Math.max(3, totalMinutes),
        leaveInMinutes: Math.max(0, firstWaitMin),
        fareMyr: fare.cashlessMyr,
        primaryColor: firstRailLeg.routeColor,
        primaryKind: 'rail',
        primaryRouteId: firstRailLeg.routeId,
        hasLiveBus: false,
      });
    }
  }

  // ---- 2. Find Walk + Bus (Live GPS!) + Walk options ----
  try {
    const [nearbyOriginBusStops, nearbyDestBusStops] = await Promise.all([
      transitApi.searchBusStops('', 3, origin.lat, origin.lon),
      transitApi.searchBusStops('', 3, destination.lat, destination.lon),
    ]);

    const fromBusStop = nearbyOriginBusStops[0];
    const toBusStop = nearbyDestBusStops[0];

    if (fromBusStop && toBusStop && fromBusStop.stopId !== toBusStop.stopId) {
      const busPlan = await transitApi.planBusTrip(fromBusStop, toBusStop, liveVehicles);
      const walk1 = calcWalk(origin.lat, origin.lon, fromBusStop.lat, fromBusStop.lon);
      const walk2 = calcWalk(toBusStop.lat, toBusStop.lon, destination.lat, destination.lon);

      for (const opt of busPlan.options.slice(0, 3)) {
        const legs: JourneyLeg[] = [];
        if (walk1.meters >= 60) {
          legs.push({
            kind: 'walk',
            fromName: origin.name,
            toName: opt.legs[0].boardStop.stopName,
            distanceMeters: walk1.meters,
            minutes: walk1.minutes,
          });
        }

        let hasLiveBus = false;
        let firstWait = opt.waitMinutes;
        let fareSum = 0;

        for (let bi = 0; bi < opt.legs.length; bi++) {
          const bl = opt.legs[bi];
          const liveList = bl.approachingBuses;
          const isLive = liveList.length > 0;
          if (isLive) hasLiveBus = true;
          const waitMin = isLive ? liveList[0].waitMinutes : bl.scheduledWaitMin;
          if (bi === 0) firstWait = waitMin;

          const upcomingWaits = isLive
            ? liveList.slice(0, 3).map((b) => ({
                minutesAway: b.waitMinutes,
                isLive: true,
                busId: b.busId,
              }))
            : [
                { minutesAway: bl.scheduledWaitMin, isLive: false },
                { minutesAway: bl.scheduledWaitMin + 20, isLive: false },
                { minutesAway: bl.scheduledWaitMin + 40, isLive: false },
              ];

          fareSum += bl.fareMyr || estimateRapidKlBusFare(bl.category, bl.distanceKm).cashlessMyr;

          legs.push({
            kind: 'bus',
            routeShortName: bl.routeShortName,
            routeLongName: bl.routeLongName,
            headsign: bl.headsign,
            color: bl.color,
            category: bl.category,
            boardStopName: bl.boardStop.stopName,
            boardStopLat: bl.boardStop.lat,
            boardStopLon: bl.boardStop.lon,
            alightStopName: bl.alightStop.stopName,
            alightStopLat: bl.alightStop.lat,
            alightStopLon: bl.alightStop.lon,
            stopCount: bl.stopCount,
            rideMinutes: bl.rideMinutes,
            waitMinutes: waitMin,
            upcomingWaits,
            isLive,
            liveBusId: liveList[0]?.busId,
          });
        }

        if (walk2.meters >= 60) {
          const lastLeg = opt.legs[opt.legs.length - 1];
          legs.push({
            kind: 'walk',
            fromName: lastLeg.alightStop.stopName,
            toName: destination.name,
            distanceMeters: walk2.meters,
            minutes: walk2.minutes,
          });
        }

        const busRideTotal = opt.legs.reduce((sum, l) => sum + l.rideMinutes, 0);
        const totalMinutes =
          (walk1.meters >= 60 ? walk1.minutes : 0) +
          busRideTotal +
          (walk2.meters >= 60 ? walk2.minutes : 0);

        const firstBus = opt.legs[0];
        options.push({
          id: `bus:${opt.id}`,
          legs,
          totalMinutes: Math.max(3, totalMinutes),
          leaveInMinutes: Math.max(0, firstWait - (walk1.meters >= 60 ? walk1.minutes : 0)),
          fareMyr: Number(fareSum.toFixed(2)),
          primaryColor: firstBus.color,
          primaryKind: firstBus.category === 'rapid-bus-mrtfeeder' ? 'feeder' : 'rapid-bus',
          hasLiveBus,
        });
      }
    }
  } catch {
    // Bus index may still be syncing; Rail + Walk options still return cleanly!
  }

  // Sort by fastest total arrival time (leaveIn + totalMinutes), prioritizing Live Bus when tied
  options.sort((a, b) => {
    const scoreA = a.totalMinutes + Math.min(20, a.leaveInMinutes) - (a.hasLiveBus ? 2 : 0);
    const scoreB = b.totalMinutes + Math.min(20, b.leaveInMinutes) - (b.hasLiveBus ? 2 : 0);
    return scoreA - scoreB;
  });

  return {
    origin,
    destination,
    options: options.slice(0, 6),
    directWalkMinutes: directWalk.minutes,
    directWalkMeters: directWalk.meters,
    directBikeMinutes,
  };
}
