import type { RailLine, RailStation } from '../types/transit';
import { estimateRapidKlRailFare, type RailFareEstimate } from './fareCalculator';
import { haversineKm } from './transitHelpers';

export interface RailTripLeg {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeColor: string;
  category: string;
  fromStation: RailStation;
  toStation: RailStation;
  stops: RailStation[];
  stopCount: number;
  distanceKm: number;
  estimatedMinutes: number;
}

export interface RailTripPlan {
  fromStation: RailStation;
  toStation: RailStation;
  legs: RailTripLeg[];
  totalStops: number;
  transferCount: number;
  totalDistanceKm: number;
  estimatedMinutes: number;
  fare: RailFareEstimate;
}

interface GraphEdge {
  toStopId: string;
  cost: number;
  isTransfer: boolean;
}

/**
 * Computes the optimal Rapid KL rail journey between two stations using Dijkstra
 * with a realistic transfer penalty (~5 min) to prefer direct lines when close.
 */
export function planRailTrip(
  fromStopId: string,
  toStopId: string,
  lines: RailLine[],
  stations: RailStation[]
): RailTripPlan | null {
  if (!fromStopId || !toStopId || fromStopId === toStopId) return null;

  const byId = new Map<string, RailStation>();
  for (const st of stations) {
    byId.set(st.stopId, st);
  }
  const start = byId.get(fromStopId);
  const goal = byId.get(toStopId);
  if (!start || !goal) return null;

  const adj = new Map<string, GraphEdge[]>();
  const addEdge = (a: string, b: string, cost: number, isTransfer: boolean) => {
    const list = adj.get(a) || [];
    list.push({ toStopId: b, cost, isTransfer });
    adj.set(a, list);
  };

  // Connect consecutive stations along each rail line
  const byRoute = new Map<string, RailStation[]>();
  for (const st of stations) {
    const arr = byRoute.get(st.routeId) || [];
    arr.push(st);
    byRoute.set(st.routeId, arr);
  }

  for (const [, list] of byRoute.entries()) {
    list.sort((a, b) => a.sequence - b.sequence);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i];
      const b = list[i + 1];
      addEdge(a.stopId, b.stopId, 2.5, false);
      addEdge(b.stopId, a.stopId, 2.5, false);
    }
  }

  // Connect interchange platforms
  for (const st of stations) {
    for (const ic of st.interchanges) {
      if (byId.has(ic.stopId)) {
        addEdge(st.stopId, ic.stopId, 5.5, true);
      }
    }
  }

  // Dijkstra shortest path
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();

  dist.set(fromStopId, 0);

  while (true) {
    let cur: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const [id, d] of dist.entries()) {
      if (!visited.has(id) && d < best) {
        best = d;
        cur = id;
      }
    }
    if (!cur || cur === toStopId) break;
    visited.add(cur);

    for (const edge of adj.get(cur) || []) {
      const alt = best + edge.cost;
      if (alt < (dist.get(edge.toStopId) ?? Number.POSITIVE_INFINITY)) {
        dist.set(edge.toStopId, alt);
        prev.set(edge.toStopId, cur);
      }
    }
  }

  if (!prev.has(toStopId)) return null;

  // Reconstruct stop path
  const pathIds: string[] = [];
  let cursor: string | undefined = toStopId;
  while (cursor) {
    pathIds.push(cursor);
    if (cursor === fromStopId) break;
    cursor = prev.get(cursor);
  }
  pathIds.reverse();
  const pathStations = pathIds.map((id) => byId.get(id)!).filter(Boolean);
  if (pathStations.length < 2) return null;

  // Group into continuous route legs (skip degenerate 1-stop transfer hops at start/end)
  const lineMap = new Map(lines.map((l) => [l.routeId, l]));
  const rawLegs: RailStation[][] = [];
  let currentGroup: RailStation[] = [pathStations[0]];

  for (let i = 1; i < pathStations.length; i++) {
    const prevSt = pathStations[i - 1];
    const st = pathStations[i];
    if (st.routeId === prevSt.routeId) {
      currentGroup.push(st);
    } else {
      rawLegs.push(currentGroup);
      currentGroup = [st];
    }
  }
  rawLegs.push(currentGroup);

  const legs: RailTripLeg[] = rawLegs
    .filter((group) => group.length >= 2)
    .map((group) => {
      const first = group[0];
      const last = group[group.length - 1];
      const line = lineMap.get(first.routeId);
      const stopCount = group.length - 1;
      let legDistKm = 0;
      for (let i = 1; i < group.length; i++) {
        legDistKm += haversineKm(
          group[i - 1].lat,
          group[i - 1].lon,
          group[i].lat,
          group[i].lon
        );
      }
      // Track curvature multiplier (~1.12x straight station-to-station chords)
      const trackKm = Math.round(legDistKm * 1.12 * 10) / 10;
      return {
        routeId: first.routeId,
        routeShortName: line?.shortName || first.routeShortName,
        routeLongName: line?.longName || first.routeLongName,
        routeColor: line?.color || first.routeColor,
        category: first.category,
        fromStation: first,
        toStation: last,
        stops: group,
        stopCount,
        distanceKm: Math.max(0.5, trackKm),
        estimatedMinutes: Math.max(2, Math.round(stopCount * 2.4)),
      };
    });

  if (legs.length === 0) {
    const directKm = Math.max(0.5, Math.round(haversineKm(start.lat, start.lon, goal.lat, goal.lon) * 10) / 10);
    return {
      fromStation: start,
      toStation: goal,
      legs: [
        {
          routeId: start.routeId,
          routeShortName: start.routeShortName,
          routeLongName: start.routeLongName,
          routeColor: start.routeColor,
          category: start.category,
          fromStation: start,
          toStation: goal,
          stops: [start, goal],
          stopCount: 1,
          distanceKm: directKm,
          estimatedMinutes: 3,
        },
      ],
      totalStops: 1,
      transferCount: 0,
      totalDistanceKm: directKm,
      estimatedMinutes: 3,
      fare: estimateRapidKlRailFare(directKm),
    };
  }

  const totalStops = legs.reduce((sum, l) => sum + l.stopCount, 0);
  const transferCount = Math.max(0, legs.length - 1);
  const totalDistanceKm =
    Math.round(legs.reduce((sum, l) => sum + l.distanceKm, 0) * 10) / 10;
  const estimatedMinutes =
    legs.reduce((sum, l) => sum + l.estimatedMinutes, 0) + transferCount * 5;

  return {
    fromStation: start,
    toStation: goal,
    legs,
    totalStops,
    transferCount,
    totalDistanceKm,
    estimatedMinutes,
    fare: estimateRapidKlRailFare(totalDistanceKm),
  };
}
