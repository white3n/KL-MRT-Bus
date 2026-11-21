import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightCircle,
  Bell,
  BellRing,
  Bus,
  Home,
  Map as MapIcon,
  Navigation,
  Radio,
  RotateCcw,
  Route,
  Settings2,
  Wifi,
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
import { getTransitPalette } from '../utils/transitTheme';
import { haversineKm, normalizeSearch } from '../utils/transitHelpers';

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

function formatAgeCompact(sec: number, lang: 'vi' | 'en'): string {
  if (sec < 60) return lang === 'en' ? `${sec}s ago` : `${sec}s trước`;
  const m = Math.max(1, Math.round(sec / 60));
  return lang === 'en' ? `${m} min ago` : `${m} phút trước`;
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

  // ---------- SELECTED BUS DETAIL (TRANSIT APP STYLE!) ----------
  if (selectedBus) {
    const stopsWithDistance = routeStopAnalysis.stops;
    const myStationStatus = routeStopAnalysis.myStationStatus;
    const primaryTargetStop = stopsWithDistance[0];
    const palette = getTransitPalette(
      selectedBus.color,
      selectedBus.category === 'rapid-bus-mrtfeeder' ? 'feeder' : 'rapid-bus'
    );

    const activeEtaMin =
      myStationStatus && !myStationStatus.passed && !myStationStatus.wrongDirection
        ? myStationStatus.etaMin
        : primaryTargetStop
          ? primaryTargetStop.etaMin
          : null;

    // Horizontal Transit ETA carousel: active bus first + up to 3 other approaching buses
    const otherArrivals = myBusArrivals.filter((a) => a.bus.id !== selectedBus.id).slice(0, 3);

    return (
      <div
        className="flex flex-col min-h-full text-white pb-8"
        style={{ backgroundColor: palette.bandBg }}
      >
        {/* Top Control Row + Floating Iconic GO Button */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectBus(null)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-extrabold text-white bg-black/25 hover:bg-black/40 active:scale-95 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{t.backToBusList}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onShowOnMap}
                aria-label={t.viewOnMap}
                title={t.viewOnMap}
                className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-black/25 hover:bg-black/40 text-white active:scale-95 transition-all cursor-pointer"
              >
                <MapIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onToggleTrackBus}
                aria-label={isTrackingBus ? t.liveTrackActive : t.liveTrackStart}
                title={isTrackingBus ? t.liveTrackActive : t.liveTrackStart}
                className={`w-9 h-9 inline-flex items-center justify-center rounded-full active:scale-95 transition-all cursor-pointer ${
                  isTrackingBus
                    ? 'bg-white text-slate-950'
                    : 'bg-black/25 hover:bg-black/40 text-white'
                }`}
              >
                {isTrackingBus ? (
                  <BellRing className="w-4 h-4 animate-pulse" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
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
                className="px-4 py-2 rounded-2xl text-white font-black text-base italic tracking-tight shadow-lg active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                style={{ backgroundColor: palette.vivid }}
              >
                <Navigation className="w-3.5 h-3.5 not-italic" />
                <span>GO</span>
              </button>
            </div>
          </div>

          {/* Transit App Horizontal Big ETA Tile Carousel */}
          <div className="flex items-stretch gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {/* Active Selected Bus Tile */}
            <div
              className="min-w-[116px] flex-1 max-w-[152px] rounded-3xl p-3.5 flex flex-col items-center justify-center text-center shadow-lg"
              style={{ backgroundColor: palette.vivid }}
            >
              <span
                className="px-2.5 py-0.5 rounded-lg bg-white text-xs font-black tracking-tight"
                style={{ color: palette.vivid }}
              >
                {selectedBus.routeShortName}
              </span>
              <div className="mt-2 flex items-start justify-center gap-0.5">
                <span className="font-display text-5xl font-black text-white leading-none tabular-nums">
                  {activeEtaMin !== null ? activeEtaMin : selectedBus.speedKmh}
                </span>
                <Wifi className="w-3.5 h-3.5 text-white/90 rotate-45 -mt-0.5" />
              </div>
              <span className="mt-1 text-xs font-bold text-white/90">
                {activeEtaMin !== null ? t.minutesWord : 'km/h'}
              </span>
            </div>

            {/* Sibling / Nearby Approaching Bus Tiles (tap to switch!) */}
            {otherArrivals.map((arr) => (
              <button
                key={arr.bus.id}
                type="button"
                onClick={() => onSelectBus(arr.bus)}
                className="min-w-[108px] flex-1 max-w-[140px] rounded-3xl p-3.5 flex flex-col items-center justify-center text-center active:scale-95 transition-all cursor-pointer"
                style={{ backgroundColor: palette.surfaceBg }}
              >
                <span className="px-2.5 py-0.5 rounded-lg bg-white/15 text-xs font-black text-white tracking-tight">
                  {arr.routeShortName}
                </span>
                <div className="mt-2 flex items-start justify-center gap-0.5">
                  <span className="font-display text-4xl font-black text-white/90 leading-none tabular-nums">
                    {arr.etaMinutes}
                  </span>
                  <Wifi className="w-3 h-3 text-white/60 rotate-45 -mt-0.5" />
                </div>
                <span className="mt-1 text-xs font-bold" style={{ color: palette.muted }}>
                  {t.minutesWord}
                </span>
              </button>
            ))}
          </div>

          {/* Wrong-direction alert OR switch to closer same-route bus */}
          {routeStopAnalysis.isWrongDirection && (
            <div className="px-3.5 py-2.5 rounded-2xl bg-amber-500/20 border border-amber-400/35 text-xs font-bold text-amber-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
              <span>{t.busWrongDirectionNotice}</span>
            </div>
          )}

          {closerSiblingBus && (
            <button
              type="button"
              onClick={() => onSelectBus(closerSiblingBus.bus)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-emerald-500 text-slate-950 text-xs font-black flex items-center justify-between gap-2 active:scale-[0.99] transition-all cursor-pointer shadow-md"
            >
              <span className="truncate">
                {t.busSwitchToClosest(
                  closerSiblingBus.bus.licensePlate,
                  closerSiblingBus.etaMinutes
                )}
              </span>
              <Radio className="w-4 h-4 shrink-0" />
            </button>
          )}

          {/* Main Transit Bus Card (Giant Route Number + Stops Away + Vertical Stop Track) */}
          <div
            className="rounded-3xl p-4 sm:p-5 space-y-4 shadow-md"
            style={{ backgroundColor: palette.surfaceBg }}
          >
            {/* Header Row */}
            <div className="flex items-start gap-3">
              <Bus className="w-6 h-6 mt-1.5 shrink-0 opacity-75" style={{ color: palette.muted }} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-4xl font-black text-white leading-none tracking-tight">
                    {selectedBus.routeShortName}
                  </h2>
                  <span className="text-xs font-bold" style={{ color: palette.muted }}>
                    {selectedBus.speedKmh} km/h
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ArrowRightCircle className="w-4 h-4 text-white shrink-0" />
                  <span className="text-base font-extrabold text-white leading-snug truncate">
                    {selectedBus.headsign || selectedBus.routeLongName}
                  </span>
                </div>

                {/* Big "X stops away" summary line like Screenshot 5 */}
                {myStationStatus && !myStationStatus.wrongDirection && (
                  <div className="pt-1">
                    {myStationStatus.passed ? (
                      <span className="text-sm font-bold text-amber-200">{t.myStationPassed}</span>
                    ) : (
                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                        <span className="font-display text-2xl font-black text-white">
                          {t.stopsRemaining(myStationStatus.stopsAway)}
                        </span>
                        <span
                          className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-white/15 text-white"
                        >
                          {myStationStatus.stopName}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Clean Vertical Transit Timeline of Upcoming Stops */}
            {loadingRouteDetail && stopsWithDistance.length === 0 ? (
              <div className="text-xs font-bold py-2" style={{ color: palette.muted }}>
                {t.loadingStops}
              </div>
            ) : stopsWithDistance.length === 0 ? (
              <p className="text-xs font-semibold leading-relaxed" style={{ color: palette.muted }}>
                {t.busRouteSyncing}
              </p>
            ) : (
              <div className="relative pl-7 space-y-3 pt-1">
                {/* Thick rounded Transit vertical bar */}
                <div className="absolute left-2 top-2 bottom-2 w-2.5 rounded-full bg-white/18" />

                {stopsWithDistance.slice(0, 8).map((stop) => (
                  <div
                    key={`${stop.stopId}-${stop.sequence}`}
                    className={`relative flex items-center justify-between gap-2 rounded-2xl px-3 py-2 transition-colors ${
                      stop.isMyStation ? 'bg-white/16 ring-1 ring-white/30' : ''
                    }`}
                  >
                    {/* White circular stop dot on vertical track */}
                    <span
                      className={`absolute -left-[22px] w-3 h-3 rounded-full border-2 ${
                        stop.isMyStation
                          ? 'bg-emerald-400 border-white scale-125'
                          : stop.isClosest
                            ? 'bg-white border-white'
                            : 'bg-white/80 border-transparent'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-sm truncate ${
                            stop.isMyStation || stop.isClosest
                              ? 'font-black text-white'
                              : 'font-bold text-white/85'
                          }`}
                        >
                          {stop.stopName}
                        </span>
                        {stop.isMyStation && (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-400 text-slate-950 text-[9px] font-black shrink-0">
                            {t.myStationBadge}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-xs font-extrabold text-white/90 tabular-nums shrink-0">
                      {stop.isClosest && stop.distKm < 0.15 ? t.nearStop : `~${stop.etaMin}m`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Clean Transit App footer line: "Updated 15s ago by Rapid KL · Plate" */}
            <div
              className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[11px] font-bold"
              style={{ color: palette.muted }}
            >
              <span>
                {lang === 'en'
                  ? `Updated ${formatAgeCompact(selectedBus.updatedSecondsAgo, 'en')} by Rapid KL`
                  : `Cập nhật ${formatAgeCompact(selectedBus.updatedSecondsAgo, 'vi')} · Rapid KL`}
              </span>
              <span className="font-mono opacity-80">{selectedBus.licensePlate}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- BUS LIST VIEW (FULL-BLEED COLOR-CODED TRANSIT BANDS!) ----------
  return (
    <div className="flex flex-col min-h-full bg-[#0b0f17] text-white pb-6">
      {/* Compact My Bus Station Header + Top 3 Approaching Full-Bleed Color Bands */}
      {!myBusStation ? (
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 bg-[#111827]">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
              <Home className="w-4.5 h-4.5 stroke-[2.5]" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-black text-white truncate">{t.myBusStationLabel}</div>
              <div className="text-xs text-slate-400 truncate">{t.setupMyBusSub}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenMyBusSetup}
            className="px-3.5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 text-xs font-black shrink-0 transition-all cursor-pointer"
          >
            {t.setupBtn}
          </button>
        </div>
      ) : (
        <div className="border-b border-black/40">
          {/* Minimalist My Station Bar */}
          <div className="px-4 py-2.5 bg-[#101826] flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onFocusMyStationOnMap}
              className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
            >
              <Home className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-black text-emerald-300 truncate">
                {myBusStation.stopName}
              </span>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  onOpenDirections({
                    name: myBusStation.stopName,
                    subtitle: t.myBusStationLabel,
                    badge: myBusStation.stopCode || 'BUS',
                    color: '#10b981',
                    lat: myBusStation.lat,
                    lon: myBusStation.lon,
                    kind: 'bus-stop',
                  })
                }
                aria-label={t.directionsBtn}
                className="w-7.5 h-7.5 inline-flex items-center justify-center rounded-full bg-white/10 text-emerald-300 active:scale-95 cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onOpenMyBusSetup}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/18 text-white text-[11px] font-extrabold active:scale-95 cursor-pointer"
              >
                <Settings2 className="w-3 h-3" />
                <span>{t.changeStationBtn}</span>
              </button>
            </div>
          </div>

          {/* Top 3 Same-Direction Approaching Buses as GIANT Color-Coded Transit Bands! */}
          {myBusArrivalsLoading && myBusArrivals.length === 0 ? (
            <div className="px-4 py-3 text-xs font-bold text-slate-400 bg-[#0d131f]">
              {t.myBusArrivalsLoading}
            </div>
          ) : myBusArrivals.length === 0 ? (
            <div className="px-4 py-3 text-xs font-semibold text-slate-400 bg-[#0d131f]">
              {t.myBusArrivalsEmpty}
            </div>
          ) : (
            <div className="divide-y divide-black/35">
              {myBusArrivals.slice(0, 3).map((arr) => {
                const pal = getTransitPalette(
                  arr.color,
                  arr.bus.category === 'rapid-bus-mrtfeeder' ? 'feeder' : 'rapid-bus'
                );
                return (
                  <button
                    key={arr.bus.id}
                    type="button"
                    onClick={() => onSelectBus(arr.bus)}
                    className="w-full px-4 py-4 flex items-center justify-between gap-3 text-left active:brightness-110 transition-all cursor-pointer"
                    style={{ backgroundColor: pal.bandBg }}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div
                        className="font-display text-3xl font-black leading-none tracking-tight"
                        style={{ color: pal.accent }}
                      >
                        {arr.routeShortName}
                      </div>
                      <div
                        className="flex items-center gap-1.5 text-sm font-extrabold truncate pt-0.5"
                        style={{ color: pal.accent }}
                      >
                        <ArrowRightCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{arr.headsign || arr.routeLongName}</span>
                      </div>
                      <div className="text-xs font-bold truncate" style={{ color: pal.muted }}>
                        {t.stopsRemaining(arr.stopsAway)} · {myBusStation.stopName}
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      <div className="flex items-start justify-end gap-0.5">
                        <span
                          className="font-display text-4xl font-black leading-none tabular-nums"
                          style={{ color: pal.accent }}
                        >
                          {arr.etaMinutes}
                        </span>
                        <Wifi
                          className="w-3.5 h-3.5 rotate-45 -mt-0.5 animate-pulse"
                          style={{ color: pal.accent }}
                        />
                      </div>
                      <div className="text-[11px] font-bold mt-0.5" style={{ color: pal.muted }}>
                        {t.minutesWord}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Minimalist Filter Strip + Bus Trip Planner */}
      <div className="px-3.5 py-2.5 bg-[#0b0f17] border-b border-white/10 space-y-2">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 grid grid-cols-3 gap-1 p-1 bg-white/8 rounded-2xl">
            {[
              { id: 'all' as const, label: t.busTabAll(data?.counts.total ?? liveVehicles.length) },
              { id: 'rapid-bus-kl' as const, label: `KL (${data?.counts.rapidBusKl ?? 0})` },
              {
                id: 'rapid-bus-mrtfeeder' as const,
                label: `Feeder (${data?.counts.mrtFeeder ?? 0})`,
              },
            ].map((tab) => {
              const active = busCategoryFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onCategoryChange(tab.id)}
                  className={`px-2 py-1.5 text-[11px] font-extrabold rounded-xl transition-all active:scale-95 whitespace-nowrap truncate cursor-pointer ${
                    active ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-white'
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
            aria-label={t.busTripPlannerCta}
            title={t.busTripPlannerCta}
            className="px-3 py-2 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black inline-flex items-center gap-1 active:scale-95 shrink-0 cursor-pointer"
          >
            <Route className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">RM 1–3</span>
          </button>

          <button
            type="button"
            onClick={onShowOnMap}
            aria-label={t.viewOnMap}
            title={t.viewOnMap}
            className="w-9 h-9 inline-flex items-center justify-center rounded-2xl bg-white/10 hover:bg-white/18 text-emerald-400 active:scale-95 shrink-0 cursor-pointer"
          >
            <MapIcon className="w-4 h-4" />
          </button>
        </div>

        {data?.staleWarning && (
          <div className="px-3 py-2 bg-amber-500/15 border border-amber-400/30 rounded-2xl text-[11px] font-bold text-amber-200">
            {data.staleWarning}
          </div>
        )}
      </div>

      {/* Full-Bleed Color-Coded Live Bus Bands (Transit App Screenshot 9 Style!) */}
      {loading && liveVehicles.length === 0 ? (
        <div className="p-4 space-y-2.5 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-white/8 rounded-2xl" />
          ))}
        </div>
      ) : error && liveVehicles.length === 0 ? (
        <div className="m-4 p-4 border border-red-500/30 bg-red-950/50 rounded-3xl space-y-3">
          <p className="text-sm text-red-100 font-bold">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-black bg-emerald-500 text-slate-950 rounded-full active:scale-95 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.retryConnect}</span>
          </button>
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="m-4 p-6 text-center rounded-3xl bg-white/6 space-y-2">
          <p className="text-sm font-black text-white">{t.noBusesTitle}</p>
          <p className="text-xs text-slate-400">
            {searchQuery ? t.noBusesQueryHint(searchQuery) : t.noBusesOffPeakHint}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-black/35">
          {filteredVehicles.slice(0, 80).map((bus) => {
            const pal = getTransitPalette(
              bus.color,
              bus.category === 'rapid-bus-mrtfeeder' ? 'feeder' : 'rapid-bus'
            );
            return (
              <button
                key={bus.id}
                type="button"
                onClick={() => onSelectBus(bus)}
                className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left active:brightness-110 transition-all cursor-pointer"
                style={{ backgroundColor: pal.bandBg }}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div
                    className="font-display text-3xl font-black leading-none tracking-tight"
                    style={{ color: pal.accent }}
                  >
                    {bus.routeShortName}
                  </div>
                  <div
                    className="flex items-center gap-1.5 text-sm font-extrabold truncate pt-0.5"
                    style={{ color: pal.accent }}
                  >
                    <ArrowRightCircle className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{bus.headsign || bus.routeLongName}</span>
                  </div>
                  <div className="text-xs font-semibold truncate" style={{ color: pal.muted }}>
                    {bus.licensePlate} ·{' '}
                    {bus.category === 'rapid-bus-mrtfeeder' ? 'MRT Feeder' : 'Rapid KL'}
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2">
                  <div className="flex items-start justify-end gap-0.5">
                    <span
                      className="font-display text-2xl font-black leading-none tabular-nums"
                      style={{ color: pal.accent }}
                    >
                      {bus.speedKmh}
                    </span>
                    <Wifi className="w-3 h-3 rotate-45 -mt-0.5 opacity-80" style={{ color: pal.accent }} />
                  </div>
                  <div className="text-[11px] font-bold mt-0.5" style={{ color: pal.muted }}>
                    km/h · {bus.updatedSecondsAgo}s
                  </div>
                </div>
              </button>
            );
          })}

          {filteredVehicles.length > 80 && (
            <p className="text-center text-xs text-slate-400 py-3 bg-[#0b0f17]">
              {t.showingFirst80(filteredVehicles.length)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
