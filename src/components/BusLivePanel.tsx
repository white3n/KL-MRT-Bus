import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellRing,
  Compass,
  Gauge,
  Home,
  Map as MapIcon,
  MapPin,
  Navigation,
  Radio,
  RotateCcw,
  Route,
  Settings2,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  findMyBusStationIndexInStops,
  matchesMyBusStationStrict,
  type MyBusStation,
} from '../hooks/useMyStations';
import { translations, useLanguage } from '../i18n';
import type {
  BusCategory,
  BusRouteDetailPayload,
  LiveBusesPayload,
  LiveBusVehicle,
  MyBusStationArrival,
} from '../types/transit';
import { findDirectionAlignedStopIndex } from '../utils/busApproach';
import type { DirectionsTarget } from '../utils/directionsHelper';
import { bearingToCompass, haversineKm, normalizeSearch } from '../utils/transitHelpers';

interface BusLivePanelProps {
  data: LiveBusesPayload | null;
  liveVehicles: LiveBusVehicle[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  busCategoryFilter: 'all' | BusCategory;
  selectedBus: LiveBusVehicle | null;
  selectedBusRouteDetail: BusRouteDetailPayload | null;
  loadingRouteDetail: boolean;
  isTrackingBus: boolean;
  myBusStation: MyBusStation | null;
  myBusArrivals: MyBusStationArrival[];
  myBusArrivalsLoading: boolean;
  onCategoryChange: (cat: 'all' | BusCategory) => void;
  onSelectBus: (vehicle: LiveBusVehicle | null) => void;
  onToggleTrackBus: () => void;
  onShowOnMap: () => void;
  onFocusMyStationOnMap: () => void;
  onOpenMyBusSetup: () => void;
  onOpenBusTripPlanner: () => void;
  onOpenDirections: (target: DirectionsTarget) => void;
  onRetry: () => void;
}

export function BusLivePanel({
  data,
  liveVehicles,
  loading,
  error,
  searchQuery,
  busCategoryFilter,
  selectedBus,
  selectedBusRouteDetail,
  loadingRouteDetail,
  isTrackingBus,
  myBusStation,
  myBusArrivals,
  myBusArrivalsLoading,
  onCategoryChange,
  onSelectBus,
  onToggleTrackBus,
  onShowOnMap,
  onFocusMyStationOnMap,
  onOpenMyBusSetup,
  onOpenBusTripPlanner,
  onOpenDirections,
  onRetry,
}: BusLivePanelProps) {
  const { lang } = useLanguage();
  const t = translations[lang];

  const filteredVehicles = useMemo(() => {
    const q = normalizeSearch(searchQuery);
    return liveVehicles
      .filter((v) => {
        if (busCategoryFilter !== 'all' && v.category !== busCategoryFilter) return false;
        if (!q) return true;
        return (
          normalizeSearch(v.routeShortName).includes(q) ||
          normalizeSearch(v.routeLongName).includes(q) ||
          normalizeSearch(v.headsign).includes(q) ||
          normalizeSearch(v.licensePlate).includes(q)
        );
      })
      .sort((a, b) => {
        const cmp = a.routeShortName.localeCompare(b.routeShortName, undefined, { numeric: true });
        if (cmp !== 0) return cmp;
        return a.updatedSecondsAgo - b.updatedSecondsAgo;
      });
  }, [liveVehicles, busCategoryFilter, searchQuery]);

  // Direction-aware, anti-jitter Upcoming Stops + My Bus Station ETA analysis
  const routeStopAnalysis = useMemo(() => {
    if (!selectedBus || !selectedBusRouteDetail?.stops.length) {
      return {
        stops: [] as Array<
          BusRouteDetailPayload['stops'][number] & {
            distKm: number;
            isClosest: boolean;
            isMyStation: boolean;
            etaMin: number;
            stopsFromBus: number;
          }
        >,
        isWrongDirection: false,
        myStationStatus: null as
          | null
          | {
              stopName: string;
              passed: boolean;
              wrongDirection: boolean;
              stopsAway: number;
              etaMin: number;
              distKm: number;
            },
      };
    }

    const stops = selectedBusRouteDetail.stops;
    const aligned = findDirectionAlignedStopIndex(stops, selectedBus);
    const closestIdx = aligned.idx;

    const withDist = stops.map((s, idx) => ({
      ...s,
      distKm: haversineKm(selectedBus.lat, selectedBus.lon, s.lat, s.lon),
      idx,
    }));

    const effectiveSpeedKmh = selectedBus.speedKmh >= 8 ? selectedBus.speedKmh : 18;
    const cumulativeKmFromClosest = new Array<number>(withDist.length).fill(0);
    for (let i = closestIdx + 1; i < withDist.length; i++) {
      const prev = withDist[i - 1];
      const cur = withDist[i];
      const seg = haversineKm(prev.lat, prev.lon, cur.lat, cur.lon);
      cumulativeKmFromClosest[i] = cumulativeKmFromClosest[i - 1] + seg * 1.15;
    }

    const calcEtaMin = (idx: number, directDistKm: number) => {
      const routeKm =
        idx > closestIdx
          ? Math.max(directDistKm, cumulativeKmFromClosest[idx] + withDist[closestIdx].distKm)
          : directDistKm;
      const stopDwellMin = Math.max(0, idx - closestIdx) * 0.45;
      return Math.max(1, Math.round((routeKm / effectiveSpeedKmh) * 60 + stopDwellMin));
    };

    // Strict same-side-of-road search for My Bus Station
    const myStationIdx = findMyBusStationIndexInStops(stops, myBusStation, closestIdx);

    let myStationStatus: {
      stopName: string;
      passed: boolean;
      wrongDirection: boolean;
      stopsAway: number;
      etaMin: number;
      distKm: number;
    } | null = null;

    if (myStationIdx >= 0) {
      const item = withDist[myStationIdx];
      const directMeters = item.distKm * 1000;
      // 95m GPS-jitter grace at the stop itself so a bus pulling into the stop never flashes "passed"
      const passed = myStationIdx < closestIdx && directMeters > 95;
      const stopsAway = Math.max(0, myStationIdx - closestIdx);
      const etaMin = passed ? 0 : calcEtaMin(myStationIdx, item.distKm);
      myStationStatus = {
        stopName: item.stopName,
        passed,
        wrongDirection: aligned.isWrongDirection,
        stopsAway,
        etaMin,
        distKm: item.distKm,
      };
    }

    const endIdx = Math.min(
      withDist.length,
      Math.max(closestIdx + 10, myStationIdx >= closestIdx ? myStationIdx + 2 : closestIdx + 10)
    );

    const visibleStops = withDist.slice(closestIdx, endIdx).map((item, relIdx) => {
      const absIdx = closestIdx + relIdx;
      return {
        ...item,
        isClosest: relIdx === 0,
        isMyStation: myBusStation ? matchesMyBusStationStrict(item, myBusStation) : false,
        stopsFromBus: relIdx,
        etaMin: calcEtaMin(absIdx, item.distKm),
      };
    });

    return { stops: visibleStops, isWrongDirection: aligned.isWrongDirection, myStationStatus };
  }, [selectedBus, selectedBusRouteDetail, myBusStation]);

  // Check if there is a single closer approaching bus of the SAME route number for My Bus Station
  const closerSiblingBus = useMemo(() => {
    if (!selectedBus || !myBusArrivals.length) return null;
    const match = myBusArrivals.find(
      (a) =>
        a.routeShortName.toUpperCase() === selectedBus.routeShortName.toUpperCase() &&
        a.bus.id !== selectedBus.id
    );
    if (!match) return null;
    if (
      routeStopAnalysis.myStationStatus?.passed ||
      routeStopAnalysis.isWrongDirection ||
      (routeStopAnalysis.myStationStatus &&
        match.etaMinutes < routeStopAnalysis.myStationStatus.etaMin)
    ) {
      return match;
    }
    return null;
  }, [selectedBus, myBusArrivals, routeStopAnalysis]);

  if (selectedBus) {
    const stopsWithDistance = routeStopAnalysis.stops;
    const myStationStatus = routeStopAnalysis.myStationStatus;
    const primaryTargetStop = stopsWithDistance[0];

    return (
      <div className="flex flex-col divide-y divide-slate-200/80 pb-6">
        <div className="p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectBus(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 active:scale-95 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t.backToBusList}</span>
            </button>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 font-mono text-[11px] font-semibold text-emerald-800 tabular-nums">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{t.gpsAgo(selectedBus.updatedSecondsAgo)}</span>
            </span>
          </div>

          <div className="flex items-start gap-3">
            <span
              className="shrink-0 mt-0.5 px-3 py-1 rounded-xl font-mono text-sm font-bold text-white tabular-nums shadow-xs"
              style={{ backgroundColor: selectedBus.color }}
            >
              {selectedBus.routeShortName}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-slate-950 leading-snug">
                {selectedBus.headsign || selectedBus.routeLongName}
              </h2>
              <p className="mt-1 text-xs text-slate-500 flex items-center flex-wrap gap-1.5">
                <span className="font-semibold text-slate-700">
                  {selectedBus.category === 'rapid-bus-mrtfeeder'
                    ? 'MRT Feeder Bus'
                    : 'Rapid Bus KL'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{t.licensePlate(selectedBus.licensePlate)}</span>
              </p>
            </div>
          </div>

          {/* Action Pills: View Live on In-App Map + Directions + Lock-Screen Live Track */}
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <button
              type="button"
              onClick={onShowOnMap}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold shadow-sm shadow-blue-600/20 transition-all cursor-pointer"
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>{t.viewOnMap}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenDirections(
                  primaryTargetStop
                    ? {
                        name: primaryTargetStop.stopName,
                        subtitle: `Bus ${selectedBus.routeShortName} · ${selectedBus.headsign || selectedBus.routeLongName}`,
                        badge: selectedBus.routeShortName,
                        color: selectedBus.color,
                        lat: primaryTargetStop.lat,
                        lon: primaryTargetStop.lon,
                        kind: 'bus-stop',
                      }
                    : {
                        name: `Bus ${selectedBus.routeShortName}`,
                        subtitle: selectedBus.headsign || selectedBus.routeLongName,
                        badge: selectedBus.routeShortName,
                        color: selectedBus.color,
                        lat: selectedBus.lat,
                        lon: selectedBus.lon,
                        kind: 'bus-live',
                      }
                )
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-slate-900 hover:bg-slate-800 active:scale-95 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>{t.directionsBtn}</span>
            </button>

            <button
              type="button"
              onClick={onToggleTrackBus}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold active:scale-95 transition-all cursor-pointer border ${
                isTrackingBus
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                  : 'bg-emerald-50 border-emerald-200/80 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              {isTrackingBus ? (
                <BellRing className="w-3.5 h-3.5 animate-pulse" />
              ) : (
                <Bell className="w-3.5 h-3.5" />
              )}
              <span>{isTrackingBus ? t.liveTrackActive : t.liveTrackStart}</span>
            </button>
          </div>

          {/* Wrong-direction warning OR quick switch to closer same-route bus */}
          {routeStopAnalysis.isWrongDirection && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{t.busWrongDirectionNotice}</span>
            </div>
          )}

          {closerSiblingBus && (
            <button
              type="button"
              onClick={() => onSelectBus(closerSiblingBus.bus)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-xs font-bold text-emerald-900 flex items-center justify-between gap-2 active:scale-[0.99] transition-all cursor-pointer"
            >
              <span className="truncate">
                {t.busSwitchToClosest(
                  closerSiblingBus.bus.licensePlate,
                  closerSiblingBus.etaMinutes
                )}
              </span>
              <Radio className="w-4 h-4 text-emerald-600 shrink-0" />
            </button>
          )}

          {/* Real-time GPS telemetry row */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Gauge className="w-3 h-3 text-blue-600" />
                <span>{t.speed}</span>
              </div>
              <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                {selectedBus.speedKmh}{' '}
                <span className="text-xs font-normal text-slate-500">km/h</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Compass className="w-3 h-3 text-blue-600" />
                <span>{t.heading}</span>
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-900 truncate">
                {bearingToCompass(selectedBus.bearing, lang)}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Navigation className="w-3 h-3 text-blue-600" />
                <span>{t.gpsCoords}</span>
              </div>
              <div className="mt-1 font-mono text-[11px] font-medium text-slate-700 tabular-nums truncate">
                {selectedBus.lat.toFixed(4)}, {selectedBus.lon.toFixed(4)}
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Bus Stops along Route + My Bus Station Highlight */}
        <div className="p-4 sm:p-5 space-y-3">
          {myStationStatus && !myStationStatus.wrongDirection && (
            <div
              className={`p-3.5 rounded-2xl border shadow-2xs space-y-1 ${
                myStationStatus.passed
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : myStationStatus.etaMin <= 3
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-gradient-to-r from-amber-50 to-emerald-50 border-emerald-300/90 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-extrabold tracking-wide uppercase px-2 py-0.5 rounded-full ${
                    myStationStatus.passed
                      ? 'bg-slate-200 text-slate-700'
                      : myStationStatus.etaMin <= 3
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-600 text-white'
                  }`}
                >
                  <Home className="w-3 h-3" />
                  <span>{t.myStationBadge}</span>
                </span>
                {!myStationStatus.passed && (
                  <span
                    className={`font-mono text-sm font-extrabold tabular-nums ${
                      myStationStatus.etaMin <= 3 ? 'text-white' : 'text-emerald-700'
                    }`}
                  >
                    ~{myStationStatus.etaMin} {t.minutesWord}
                  </span>
                )}
              </div>
              <div className="font-display text-sm font-bold truncate">
                {myStationStatus.stopName}
              </div>
              <div
                className={`text-xs font-medium ${
                  myStationStatus.passed
                    ? 'text-slate-500'
                    : myStationStatus.etaMin <= 3
                      ? 'text-emerald-50'
                      : 'text-emerald-900'
                }`}
              >
                {myStationStatus.passed
                  ? t.myStationPassed
                  : myStationStatus.etaMin <= 2
                    ? `${t.myStationArrivingSoon} (${t.myStationEtaCard(myStationStatus.etaMin, myStationStatus.stopsAway)})`
                    : t.myStationEtaCard(myStationStatus.etaMin, myStationStatus.stopsAway)}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900">{t.upcomingStops}</h3>
            {loadingRouteDetail && <span className="text-xs text-slate-400">{t.loadingStops}</span>}
          </div>

          {!loadingRouteDetail && stopsWithDistance.length === 0 ? (
            <p className="text-xs text-slate-500 leading-relaxed">{t.busRouteSyncing}</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
              {stopsWithDistance.map((stop) => {
                const distLabel =
                  stop.distKm < 1
                    ? `${Math.round(stop.distKm * 1000)}m`
                    : `${stop.distKm.toFixed(1)}km`;
                return (
                  <div
                    key={`${stop.stopId}-${stop.sequence}`}
                    className={`px-3.5 py-3 flex items-center justify-between gap-2 transition-colors ${
                      stop.isMyStation
                        ? 'bg-emerald-50/90 ring-1 ring-inset ring-emerald-300'
                        : stop.isClosest
                          ? 'bg-blue-50/70'
                          : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <MapPin
                        className={`w-4 h-4 shrink-0 ${
                          stop.isMyStation
                            ? 'text-emerald-600'
                            : stop.isClosest
                              ? 'text-blue-600'
                              : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p
                            className={`text-sm truncate ${
                              stop.isMyStation
                                ? 'font-bold text-emerald-950'
                                : 'font-medium text-slate-900'
                            }`}
                          >
                            {stop.stopName}
                          </p>
                          {stop.isMyStation && (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-[10px] font-bold text-white shrink-0">
                              {t.myStationBadge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {stop.stopCode ? `${stop.stopCode} · ` : ''}
                          {t.distanceAway(distLabel)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`font-mono text-xs font-bold tabular-nums ${
                          stop.isMyStation ? 'text-emerald-700' : 'text-slate-800'
                        }`}
                      >
                        {stop.isClosest && stop.distKm < 0.15
                          ? t.nearStop
                          : t.minsShort(stop.etaMin)}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          onOpenDirections({
                            name: stop.stopName,
                            subtitle: `Bus ${selectedBus.routeShortName} Stop`,
                            badge: selectedBus.routeShortName,
                            color: selectedBus.color,
                            lat: stop.lat,
                            lon: stop.lon,
                            kind: 'bus-stop',
                          })
                        }
                        aria-label={t.directionsBtn}
                        title={t.directionsBtn}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-600 transition-all cursor-pointer"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">{t.busRealtimeFootnote}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-slate-200/80 pb-6">
      {/* Dedicated My Bus Station Live Arrival Board (Top of Bus tab — Setup separately, max 3 unique route numbers!) */}
      <div className="p-4 bg-white space-y-3">
        {!myBusStation ? (
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/70 border border-emerald-200/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Home className="w-4.5 h-4.5" />
              </span>
              <div className="min-w-0">
                <div className="font-display text-sm font-bold text-slate-950 truncate">
                  {t.myBusStationLabel}
                </div>
                <div className="text-xs text-slate-600 line-clamp-1">{t.setupMyBusSub}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenMyBusSetup}
              className="px-3.5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold shadow-xs shrink-0 transition-all cursor-pointer"
            >
              {t.setupBtn}
            </button>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-50/90 to-white border border-emerald-200/90 shadow-2xs space-y-3">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={onFocusMyStationOnMap}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
              >
                <span className="w-8.5 h-8.5 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Home className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    {t.myBusStationLabel}
                  </div>
                  <div className="font-display text-sm font-bold text-slate-950 truncate">
                    {myBusStation.stopName}
                  </div>
                </div>
              </button>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onOpenDirections({
                      name: myBusStation.stopName,
                      subtitle: t.myBusStationLabel,
                      badge: myBusStation.stopCode || 'BUS',
                      color: '#059669',
                      lat: myBusStation.lat,
                      lon: myBusStation.lon,
                      kind: 'bus-stop',
                    })
                  }
                  aria-label={t.directionsBtn}
                  title={t.directionsBtn}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-white border border-emerald-200 text-blue-600 hover:bg-blue-50 active:scale-95 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onOpenMyBusSetup}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white border border-emerald-200 hover:bg-emerald-50 text-emerald-800 text-[11px] font-semibold active:scale-95 cursor-pointer"
                >
                  <Settings2 className="w-3 h-3" />
                  <span>{t.changeStationBtn}</span>
                </button>
              </div>
            </div>

            {/* Top 3 Same-Direction Approaching Buses (1 closest bus per unique route number) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-emerald-800 font-semibold px-0.5">
                <span className="inline-flex items-center gap-1">
                  <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
                  <span>{t.myBusArrivalsTitle}</span>
                </span>
              </div>

              {myBusArrivalsLoading && myBusArrivals.length === 0 ? (
                <div className="text-xs text-slate-500 py-1.5 px-1">{t.myBusArrivalsLoading}</div>
              ) : myBusArrivals.length === 0 ? (
                <div className="text-xs text-slate-500 py-1.5 px-1">{t.myBusArrivalsEmpty}</div>
              ) : (
                <div className="space-y-1.5">
                  {myBusArrivals.slice(0, 3).map((arr) => {
                    const distTxt =
                      arr.distanceMeters < 1000
                        ? `${arr.distanceMeters}m`
                        : `${(arr.distanceMeters / 1000).toFixed(1)}km`;
                    return (
                      <div
                        key={arr.bus.id}
                        className="p-2.5 rounded-xl bg-white border border-emerald-200/80 flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <button
                          type="button"
                          onClick={() => onSelectBus(arr.bus)}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <span
                            className="shrink-0 min-w-[46px] text-center px-1.5 py-1 rounded-lg font-mono text-xs font-bold text-white"
                            style={{ backgroundColor: arr.color }}
                          >
                            {arr.routeShortName}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {arr.headsign || arr.routeLongName}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-emerald-700">
                                {t.stopsRemaining(arr.stopsAway)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">{distTxt}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">{arr.bus.licensePlate}</span>
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`font-mono text-sm font-extrabold tabular-nums ${
                              arr.isArrivingNow || arr.etaMinutes <= 2
                                ? 'text-emerald-600'
                                : 'text-slate-950'
                            }`}
                          >
                            ~{arr.etaMinutes}m
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectBus(arr.bus);
                              onShowOnMap();
                            }}
                            aria-label={t.viewOnMap}
                            title={t.viewOnMap}
                            className="w-7.5 h-7.5 inline-flex items-center justify-center rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 active:scale-95 cursor-pointer"
                          >
                            <MapIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Category Filter + Bus Trip Planner CTA + Live Stats */}
      <div className="p-4 space-y-3 bg-slate-50/60">
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-2xl">
          {[
            { id: 'all' as const, label: t.busTabAll(data?.counts.total ?? liveVehicles.length) },
            { id: 'rapid-bus-kl' as const, label: t.busTabRapid(data?.counts.rapidBusKl ?? 0) },
            {
              id: 'rapid-bus-mrtfeeder' as const,
              label: t.busTabFeeder(data?.counts.mrtFeeder ?? 0),
            },
          ].map((tab) => {
            const active = busCategoryFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onCategoryChange(tab.id)}
                className={`px-2 py-2 text-xs font-semibold rounded-xl transition-all active:scale-95 whitespace-nowrap truncate cursor-pointer ${
                  active
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onOpenBusTripPlanner}
          className="w-full px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 active:scale-[0.99] text-white shadow-sm shadow-blue-600/20 flex items-center justify-between gap-2 transition-all cursor-pointer"
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Route className="w-4 h-4" />
            </span>
            <span className="text-xs font-bold truncate">{t.busTripPlannerCta}</span>
          </span>
          <span className="text-[11px] font-semibold text-blue-100 whitespace-nowrap shrink-0">
            ETA · RM 1–3 →
          </span>
        </button>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{t.busSourceLabel}</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t.realtimeBadge}</span>
          </span>
        </div>

        {data?.staleWarning && (
          <div className="px-3.5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
            {data.staleWarning}
          </div>
        )}
      </div>

      {/* Loading / Error / Vehicle List */}
      <div className="p-4 space-y-2.5">
        {loading && liveVehicles.length === 0 ? (
          <div className="space-y-2.5 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-2xl" />
            ))}
          </div>
        ) : error && liveVehicles.length === 0 ? (
          <div className="p-4 border border-red-200 bg-red-50 rounded-2xl space-y-3">
            <p className="text-sm text-red-900 font-medium">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.retryConnect}</span>
            </button>
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="p-6 text-center border border-slate-200 rounded-2xl space-y-2 bg-white">
            <p className="text-sm font-semibold text-slate-800">{t.noBusesTitle}</p>
            <p className="text-xs text-slate-500">
              {searchQuery ? t.noBusesQueryHint(searchQuery) : t.noBusesOffPeakHint}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-display text-xs font-semibold text-slate-500 truncate">
                  {t.liveBusesHeader}
                </h3>
                <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                  ({t.busesCount(filteredVehicles.length)})
                </span>
              </div>

              <button
                type="button"
                onClick={onShowOnMap}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold active:scale-95 transition-all shrink-0 cursor-pointer"
              >
                <MapIcon className="w-3 h-3" />
                <span>
                  {searchQuery ? t.viewNBusesOnMap(filteredVehicles.length) : t.viewOnMap}
                </span>
              </button>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
              {filteredVehicles.slice(0, 80).map((bus) => (
                <button
                  key={bus.id}
                  type="button"
                  onClick={() => onSelectBus(bus)}
                  className="w-full px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100/70 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="shrink-0 min-w-[52px] text-center px-2 py-1 rounded-xl font-mono text-xs font-bold text-white tabular-nums shadow-2xs"
                      style={{ backgroundColor: bus.color }}
                    >
                      {bus.routeShortName}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {bus.headsign || bus.routeLongName}
                      </p>
                      <p className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
                        <span className="font-mono">{bus.licensePlate}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {bus.category === 'rapid-bus-mrtfeeder' ? 'MRT Feeder' : 'Rapid Bus'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      {bus.speedKmh} km/h
                    </div>
                    <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {t.agoShort(bus.updatedSecondsAgo)}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {filteredVehicles.length > 80 && (
              <p className="text-center text-xs text-slate-400 pt-1">
                {t.showingFirst80(filteredVehicles.length)}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
