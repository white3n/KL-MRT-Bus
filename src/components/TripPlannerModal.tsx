import {
  ArrowUpDown,
  BookmarkCheck,
  Bus,
  Clock,
  ExternalLink,
  LocateFixed,
  MapPin,
  Navigation,
  Radio,
  Route,
  Search,
  Ticket,
  TrainFront,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MyBusStation } from '../hooks/useMyStations';
import { translations, useLanguage } from '../i18n';
import { transitApi } from '../services/transitApi';
import type {
  BusStopSearchItem,
  BusTripPlanPayload,
  LiveBusVehicle,
  NearbyBusStop,
  RailLine,
  RailStation,
  UserLocation,
} from '../types/transit';
import {
  buildGoogleMapsDirectionsUrl,
  openExternalMapUrl,
  type DirectionsTarget,
} from '../utils/directionsHelper';
import { formatMyr } from '../utils/fareCalculator';
import { planRailTrip } from '../utils/railRouter';

interface TripPlannerModalProps {
  open: boolean;
  initialTab?: 'rail' | 'bus';
  lines: RailLine[];
  stations: RailStation[];
  liveVehicles: LiveBusVehicle[];
  userLocation: UserLocation | null;
  myBusStation: MyBusStation | null;
  nearestRailStopId?: string | null;
  nearestBusStop?: NearbyBusStop | null;
  onClose: () => void;
  onSelectStation: (stopId: string) => void;
  onSelectBusById: (busId: string, openMap: boolean) => void;
  onOpenDirections: (target: DirectionsTarget) => void;
}

function BusStopAutocomplete({
  label,
  dotColor,
  selectedStop,
  userLocation,
  placeholder,
  onSelect,
}: {
  label: string;
  dotColor: string;
  selectedStop: BusStopSearchItem | null;
  userLocation: UserLocation | null;
  placeholder: string;
  onSelect: (stop: BusStopSearchItem) => void;
}) {
  const [query, setQuery] = useState(selectedStop?.stopName || '');
  const [focused, setFocused] = useState(false);
  const [results, setResults] = useState<BusStopSearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (selectedStop && !focused) {
      setQuery(selectedStop.stopName);
    }
  }, [selectedStop, focused]);

  useEffect(() => {
    if (!focused) return;
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      transitApi
        .searchBusStops(query, 12, userLocation?.lat, userLocation?.lon)
        .then((items) => {
          if (!cancelled) setResults(items);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, focused, userLocation?.lat, userLocation?.lon]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 bg-white border border-slate-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-600/15 rounded-2xl px-3 py-2 transition-all">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={query}
              onFocus={() => {
                setFocused(true);
                if (selectedStop && query === selectedStop.stopName) {
                  setQuery('');
                }
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  setFocused(false);
                  if (selectedStop) setQuery(selectedStop.stopName);
                }, 180);
              }}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal bg-transparent focus:outline-none truncate"
            />
            {query && focused && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQuery('');
                }}
                className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </div>

      {focused && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-56 overflow-y-auto transit-scroll bg-white border border-slate-200 rounded-2xl shadow-xl divide-y divide-slate-100">
          {searching && results.length === 0 ? (
            <div className="px-3.5 py-3 text-xs text-slate-400">Loading…</div>
          ) : results.length === 0 ? (
            <div className="px-3.5 py-3 text-xs text-slate-400">—</div>
          ) : (
            results.map((stop) => (
              <button
                key={`${stop.category}-${stop.stopId}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(stop);
                  setQuery(stop.stopName);
                  setFocused(false);
                }}
                className="w-full px-3.5 py-2.5 text-left hover:bg-blue-50/70 flex items-center justify-between gap-2 cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">{stop.stopName}</div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1 flex-wrap mt-0.5">
                    {stop.stopCode && <span className="font-mono">{stop.stopCode}</span>}
                    {stop.routeNames.slice(0, 4).map((r) => (
                      <span
                        key={r}
                        className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-mono text-[10px] font-bold"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function TripPlannerModal({
  open,
  initialTab = 'rail',
  lines,
  stations,
  liveVehicles,
  userLocation,
  myBusStation,
  nearestRailStopId,
  nearestBusStop,
  onClose,
  onSelectStation,
  onSelectBusById,
  onOpenDirections,
}: TripPlannerModalProps) {
  const { lang } = useLanguage();
  const t = translations[lang];

  const [activeTab, setActiveTab] = useState<'rail' | 'bus'>(initialTab);
  const [fromId, setFromId] = useState<string>(nearestRailStopId || 'KJ15');
  const [toId, setToId] = useState<string>('KJ10');

  // Bus Trip Planner state
  const [fromBusStop, setFromBusStop] = useState<BusStopSearchItem | null>(null);
  const [toBusStop, setToBusStop] = useState<BusStopSearchItem | null>(null);
  const [busPlan, setBusPlan] = useState<BusTripPlanPayload | null>(null);
  const [busPlanLoading, setBusPlanLoading] = useState(false);

  // Sync tab when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      if (initialTab === 'bus' && !fromBusStop) {
        if (myBusStation) {
          setFromBusStop({
            stopId: myBusStation.stopId,
            stopCode: myBusStation.stopCode,
            stopName: myBusStation.stopName,
            category: myBusStation.category || 'rapid-bus-kl',
            lat: myBusStation.lat,
            lon: myBusStation.lon,
            routeNames: [],
          });
        } else if (nearestBusStop) {
          setFromBusStop({
            stopId: nearestBusStop.stopId,
            stopCode: nearestBusStop.stopCode,
            stopName: nearestBusStop.stopName,
            category: nearestBusStop.category,
            lat: nearestBusStop.lat,
            lon: nearestBusStop.lon,
            routeNames: [],
          });
        }
      }
    }
  }, [open, initialTab, myBusStation, nearestBusStop, fromBusStop]);

  // Compute Bus Trip Plan whenever fromBusStop, toBusStop, or liveVehicles update
  const liveVehiclesSignature = useMemo(
    () => `${liveVehicles.length}:${Math.floor(Date.now() / 4000)}`,
    [liveVehicles.length]
  );

  useEffect(() => {
    if (!open || activeTab !== 'bus' || !fromBusStop || !toBusStop) {
      if (!fromBusStop || !toBusStop) setBusPlan(null);
      return;
    }
    let cancelled = false;
    setBusPlanLoading(true);
    transitApi
      .planBusTrip(fromBusStop, toBusStop, liveVehicles)
      .then((res) => {
        if (!cancelled) setBusPlan(res);
      })
      .catch(() => {
        if (!cancelled) setBusPlan({ fromStop: fromBusStop, toStop: toBusStop, options: [], staticReady: false });
      })
      .finally(() => {
        if (!cancelled) setBusPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeTab, fromBusStop, toBusStop, liveVehiclesSignature]);

  const sortedStations = useMemo(
    () =>
      [...stations].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
      ),
    [stations]
  );

  const railPlan = useMemo(
    () => planRailTrip(fromId, toId, lines, stations),
    [fromId, toId, lines, stations]
  );

  if (!open) return null;

  const handleSwapRail = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const handleSwapBus = () => {
    setFromBusStop(toBusStop);
    setToBusStop(fromBusStop);
  };

  const applyMyBusStationAsOrigin = () => {
    if (!myBusStation) return;
    setFromBusStop({
      stopId: myBusStation.stopId,
      stopCode: myBusStation.stopCode,
      stopName: myBusStation.stopName,
      category: myBusStation.category || 'rapid-bus-kl',
      lat: myBusStation.lat,
      lon: myBusStation.lon,
      routeNames: [],
    });
  };

  const applyNearestBusStopAsOrigin = () => {
    if (!nearestBusStop) return;
    setFromBusStop({
      stopId: nearestBusStop.stopId,
      stopCode: nearestBusStop.stopCode,
      stopName: nearestBusStop.stopName,
      category: nearestBusStop.category,
      lat: nearestBusStop.lat,
      lon: nearestBusStop.lon,
      routeNames: [],
    });
  };

  return (
    <div
      className="fixed inset-0 z-[1050] flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trip-planner-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-lg max-h-[90dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden">
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <span className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2.5 pb-3 border-b border-slate-100 space-y-3 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                <Route className="w-4.5 h-4.5" />
              </span>
              <div className="min-w-0">
                <h3
                  id="trip-planner-title"
                  className="font-display text-base font-bold text-slate-950 truncate"
                >
                  {t.tripModalTitle}
                </h3>
                <p className="text-xs text-slate-500 truncate">{t.tripModalSub}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={t.pwaCloseAria}
              className="w-9 h-9 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Rail vs Bus Mode Segmented Tabs */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-100 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setActiveTab('rail')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                activeTab === 'rail'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrainFront className="w-4 h-4 shrink-0" />
              <span>{t.tripTabRail}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bus')}
              className={`py-2 px-3 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${
                activeTab === 'bus'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bus className="w-4 h-4 shrink-0" />
              <span>{t.tripTabBus}</span>
            </button>
          </div>
        </div>

        {/* Picker Area */}
        {activeTab === 'rail' ? (
          <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 space-y-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {t.tripFrom}
                    </div>
                    <select
                      value={fromId}
                      onChange={(e) => setFromId(e.target.value)}
                      aria-label={t.tripFrom}
                      className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-none cursor-pointer truncate"
                    >
                      <option value="">{t.tripSelectStation}</option>
                      {sortedStations.map((st) => (
                        <option key={st.stopId} value={st.stopId}>
                          [{st.stopId}] {st.displayName} ({st.routeShortName})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-3 py-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {t.tripTo}
                    </div>
                    <select
                      value={toId}
                      onChange={(e) => setToId(e.target.value)}
                      aria-label={t.tripTo}
                      className="w-full text-sm font-semibold text-slate-900 bg-transparent focus:outline-none cursor-pointer truncate"
                    >
                      <option value="">{t.tripSelectStation}</option>
                      {sortedStations.map((st) => (
                        <option key={st.stopId} value={st.stopId}>
                          [{st.stopId}] {st.displayName} ({st.routeShortName})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSwapRail}
                aria-label={t.tripSwap}
                title={t.tripSwap}
                className="w-10 h-10 rounded-full bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 flex items-center justify-center text-slate-700 shadow-2xs shrink-0 cursor-pointer"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>

            {nearestRailStopId && (
              <button
                type="button"
                onClick={() => setFromId(nearestRailStopId)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>{t.tripUseNearest}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 space-y-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 space-y-2 min-w-0">
                <BusStopAutocomplete
                  label={t.busTripFromLabel}
                  dotColor="#2563EB"
                  selectedStop={fromBusStop}
                  userLocation={userLocation}
                  placeholder={t.busTripSearchPlaceholder}
                  onSelect={setFromBusStop}
                />
                <BusStopAutocomplete
                  label={t.busTripToLabel}
                  dotColor="#E11D48"
                  selectedStop={toBusStop}
                  userLocation={userLocation}
                  placeholder={t.busTripSearchPlaceholder}
                  onSelect={setToBusStop}
                />
              </div>

              <button
                type="button"
                onClick={handleSwapBus}
                aria-label={t.tripSwap}
                title={t.tripSwap}
                className="w-10 h-10 rounded-full bg-white border border-slate-200 hover:bg-slate-100 active:scale-95 flex items-center justify-center text-slate-700 shadow-2xs shrink-0 cursor-pointer"
              >
                <ArrowUpDown className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {myBusStation && (
                <button
                  type="button"
                  onClick={applyMyBusStationAsOrigin}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                >
                  <BookmarkCheck className="w-3.5 h-3.5" />
                  <span>{t.busTripUseMyStation}</span>
                </button>
              )}
              {nearestBusStop && (
                <button
                  type="button"
                  onClick={applyNearestBusStopAsOrigin}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                >
                  <LocateFixed className="w-3.5 h-3.5" />
                  <span>{t.busTripUseNearestStop}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto transit-scroll p-5 space-y-4">
          {activeTab === 'rail' ? (
            !railPlan ? (
              <div className="p-6 text-center rounded-2xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
                {t.tripNoRoute}
              </div>
            ) : (
              <>
                {/* Rail Summary + Fare Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/60 border border-blue-200/80 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4.5 h-4.5 text-blue-600 shrink-0" />
                      <div>
                        <div className="font-mono text-base font-bold text-slate-950 tabular-nums">
                          {t.tripEstMins(railPlan.estimatedMinutes)}{' '}
                          <span className="text-xs font-medium text-slate-500">
                            · {railPlan.totalDistanceKm} km
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          {railPlan.transferCount === 0
                            ? t.tripDirect
                            : t.tripTransfers(railPlan.transferCount)}{' '}
                          · {t.tripStopsCount(railPlan.totalStops)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {railPlan.legs.map((leg, i) => (
                        <span
                          key={`${leg.routeId}-${i}`}
                          className="px-2 py-0.5 rounded-lg font-mono text-[11px] font-bold text-white"
                          style={{ backgroundColor: leg.routeColor }}
                        >
                          {leg.routeShortName}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Rapid KL Rail Fare Breakdown */}
                  <div className="pt-2.5 border-t border-blue-200/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Ticket className="w-3.5 h-3.5 text-blue-600" />
                        <span>{t.fareEstLabel}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        {t.fareMy50}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="p-2 rounded-xl bg-white border border-blue-200/80 text-center">
                        <div className="text-[10px] font-semibold text-blue-700">
                          {t.fareCashless}
                        </div>
                        <div className="font-mono text-sm font-extrabold text-slate-950 tabular-nums mt-0.5">
                          {formatMyr(railPlan.fare.cashlessMyr)}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-white/80 border border-slate-200 text-center">
                        <div className="text-[10px] font-semibold text-slate-500">
                          {t.fareToken}
                        </div>
                        <div className="font-mono text-sm font-bold text-slate-800 tabular-nums mt-0.5">
                          {formatMyr(railPlan.fare.cashTokenMyr)}
                        </div>
                      </div>
                      <div className="p-2 rounded-xl bg-white/80 border border-slate-200 text-center">
                        <div className="text-[10px] font-semibold text-slate-500">
                          {t.fareConcession}
                        </div>
                        <div className="font-mono text-sm font-bold text-emerald-700 tabular-nums mt-0.5">
                          {formatMyr(railPlan.fare.concessionMyr)}
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug">{t.fareRailNote}</p>
                  </div>
                </div>

                {/* Vertical Rail Leg Timeline */}
                <div className="space-y-3">
                  {railPlan.legs.map((leg, idx) => (
                    <div
                      key={`${leg.routeId}-${idx}`}
                      className="p-4 rounded-2xl border border-slate-200/90 bg-white space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="px-2 py-0.5 rounded-lg font-mono text-xs font-bold text-white shrink-0"
                            style={{ backgroundColor: leg.routeColor }}
                          >
                            {leg.routeShortName}
                          </span>
                          <span className="text-xs font-semibold text-slate-700 truncate">
                            {leg.category} {leg.routeLongName}
                          </span>
                        </div>
                        <span className="font-mono text-xs text-slate-500 tabular-nums shrink-0">
                          {t.tripStopsCount(leg.stopCount)} · {t.tripEstMins(leg.estimatedMinutes)}
                        </span>
                      </div>

                      <div
                        className="pl-3.5 ml-1.5 border-l-4 space-y-2.5"
                        style={{ borderColor: leg.routeColor }}
                      >
                        <div>
                          <div className="text-[11px] text-slate-400">
                            {idx === 0 ? t.tripBoardAt : t.tripTransferAt}
                          </div>
                          <div className="text-sm font-bold text-slate-950">
                            <span className="font-mono text-xs text-slate-500 mr-1.5">
                              {leg.fromStation.stopId}
                            </span>
                            {leg.fromStation.displayName}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-400">
                            {idx === railPlan.legs.length - 1 ? t.tripAlightAt : t.tripTransferAt}
                          </div>
                          <div className="text-sm font-bold text-slate-950">
                            <span className="font-mono text-xs text-slate-500 mr-1.5">
                              {leg.toStation.stopId}
                            </span>
                            {leg.toStation.displayName}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenDirections({
                        name: railPlan.fromStation.displayName,
                        subtitle: `${railPlan.fromStation.category} ${railPlan.fromStation.routeLongName}`,
                        badge: railPlan.fromStation.stopId,
                        color: railPlan.fromStation.routeColor,
                        lat: railPlan.fromStation.lat,
                        lon: railPlan.fromStation.lon,
                        kind: 'rail',
                      });
                    }}
                    className="py-2.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{t.tripDirToStart}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectStation(railPlan.fromStation.stopId);
                      onClose();
                    }}
                    className="py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200/80 active:scale-95 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <TrainFront className="w-3.5 h-3.5" />
                    <span>{t.tripViewStartBoard}</span>
                  </button>
                </div>
              </>
            )
          ) : (
            /* BUS TRIP PLANNER MULTI-OPTION RESULTS */
            <>
              {!fromBusStop || !toBusStop ? (
                <div className="p-6 text-center rounded-2xl border border-slate-200 bg-slate-50 text-xs text-slate-500 space-y-2">
                  <p>{t.busTripPickBoth}</p>
                  <p className="text-[11px] text-slate-400">{t.fareBusCashlessNote}</p>
                </div>
              ) : busPlanLoading && !busPlan ? (
                <div className="space-y-3 animate-pulse">
                  <div className="text-xs text-slate-500 text-center">{t.busTripLoadingIndex}</div>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-28 bg-slate-100 rounded-2xl" />
                  ))}
                </div>
              ) : !busPlan || busPlan.options.length === 0 ? (
                <div className="p-5 text-center rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                  <p className="text-xs text-slate-600 leading-relaxed">{t.busTripNoOptions}</p>
                  <button
                    type="button"
                    onClick={() => {
                      const url = buildGoogleMapsDirectionsUrl(
                        {
                          lat: fromBusStop.lat,
                          lon: fromBusStop.lon,
                          accuracyMeters: 0,
                          timestamp: Date.now(),
                        },
                        {
                          name: toBusStop.stopName,
                          lat: toBusStop.lat,
                          lon: toBusStop.lon,
                          kind: 'bus-stop',
                        },
                        'transit'
                      );
                      openExternalMapUrl(url);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{t.busTripOpenGmapsTransit}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <span className="text-xs font-bold text-slate-900">
                      {t.busTripOptionsFound(busPlan.options.length)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      {t.fareMy50}
                    </span>
                  </div>

                  {busPlan.options.map((opt) => {
                    const firstLeg = opt.legs[0];
                    const nextLiveBus = firstLeg.approachingBuses[0] || null;

                    return (
                      <div
                        key={opt.id}
                        className="p-4 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-3"
                      >
                        {/* Option Top Row: Route Badges + Total Time + Fare */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {opt.legs.map((leg, i) => (
                                <span key={`${leg.routeId}-${i}`} className="inline-flex items-center gap-1">
                                  {i > 0 && <span className="text-slate-400 text-xs">→</span>}
                                  <span
                                    className="px-2.5 py-0.5 rounded-lg font-mono text-xs font-bold text-white"
                                    style={{ backgroundColor: leg.color }}
                                  >
                                    {leg.routeShortName}
                                  </span>
                                </span>
                              ))}
                              <span className="text-[11px] font-semibold text-slate-500">
                                {opt.transferCount === 0
                                  ? t.tripDirect
                                  : t.tripTransfers(opt.transferCount)}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-slate-900">
                                {t.busTripTotalMins(opt.totalMinutes)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{t.busTripRideMins(opt.totalRideMinutes)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{t.tripStopsCount(opt.totalStops)}</span>
                            </div>
                          </div>

                          {/* Estimated Cashless Bus Fare Pill */}
                          <div className="text-right shrink-0">
                            <div className="px-2.5 py-1 rounded-xl bg-blue-50 border border-blue-200/80 font-mono text-sm font-extrabold text-blue-800 tabular-nums">
                              {formatMyr(opt.totalFareMyr)}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {opt.legs.length === 1 && opt.legs[0].isFlatRate
                                ? t.busTripFlatFeeder
                                : t.fareCashless}
                            </div>
                          </div>
                        </div>

                        {/* Live Approaching Bus Wait Banner */}
                        {nextLiveBus ? (
                          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200/90 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse shrink-0" />
                                <span className="text-xs font-extrabold text-emerald-900">
                                  {t.busTripLiveWait(nextLiveBus.waitMinutes)}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-[9px] font-bold text-white">
                                  {t.busTripNextBusTag}
                                </span>
                              </div>
                              <div className="text-[11px] text-emerald-800 font-mono truncate mt-0.5">
                                {t.busTripApproachingBus(
                                  nextLiveBus.licensePlate,
                                  nextLiveBus.stopsAway,
                                  nextLiveBus.speedKmh
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectBusById(nextLiveBus.busId, true);
                                onClose();
                              }}
                              className="px-2.5 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold shrink-0 active:scale-95 transition-all cursor-pointer"
                            >
                              {t.busTripTrackThisBus}
                            </button>
                          </div>
                        ) : (
                          <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{t.busTripSchedWait(opt.waitMinutes)}</span>
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {opt.totalDistanceKm} km
                            </span>
                          </div>
                        )}

                        {/* Route Legs Breakdown */}
                        <div className="space-y-2">
                          {opt.legs.map((leg, lIdx) => (
                            <div
                              key={`${leg.routeId}-${lIdx}`}
                              className="pl-3 ml-1 border-l-3 space-y-1 text-xs"
                              style={{ borderColor: leg.color }}
                            >
                              <div className="font-semibold text-slate-900 truncate">
                                <span className="text-slate-400 font-normal mr-1">
                                  {lIdx === 0 ? t.tripBoardAt : t.tripTransferAt}:
                                </span>
                                {leg.boardStop.stopName}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Bus <strong className="font-mono text-slate-700">{leg.routeShortName}</strong> ·{' '}
                                {t.tripStopsCount(leg.stopCount)} · {t.busTripRideMins(leg.rideMinutes)} ·{' '}
                                <span className="font-mono font-semibold text-slate-700">
                                  {formatMyr(leg.fareMyr)}
                                </span>
                              </div>
                              <div className="font-semibold text-slate-900 truncate">
                                <span className="text-slate-400 font-normal mr-1">
                                  {lIdx === opt.legs.length - 1 ? t.tripAlightAt : t.tripTransferAt}:
                                </span>
                                {leg.alightStop.stopName}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Quick Board Walk Note + Directions to Boarding Stop */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-500 truncate">
                            {opt.walkToBoardMeters > 20
                              ? t.busTripBoardWalk(opt.walkToBoardMeters)
                              : firstLeg.boardStop.stopName}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenDirections({
                                name: firstLeg.boardStop.stopName,
                                subtitle: `Bus ${firstLeg.routeShortName} · ${firstLeg.headsign}`,
                                badge: firstLeg.routeShortName,
                                color: firstLeg.color,
                                lat: firstLeg.boardStop.lat,
                                lon: firstLeg.boardStop.lon,
                                kind: 'bus-stop',
                              });
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold shrink-0 active:scale-95 transition-all cursor-pointer"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>{t.directionsBtn}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <p className="text-[11px] text-slate-400 leading-relaxed text-center pt-1">
                    {t.fareBusCashlessNote}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
