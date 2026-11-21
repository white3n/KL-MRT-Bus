import { Bus, LocateFixed, MapPin, Search, TrainFront, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { MyBusStation, MyRailStation } from '../hooks/useMyStations';
import { translations, useLanguage } from '../i18n';
import { transitApi } from '../services/transitApi';
import type {
  BusStopSearchItem,
  NearbyBusStop,
  RailStation,
  UserLocation,
} from '../types/transit';
import { normalizeSearch } from '../utils/transitHelpers';

interface MyStationSetupModalProps {
  mode: 'rail' | 'bus' | null;
  railStations: RailStation[];
  userLocation: UserLocation | null;
  nearestRailStopId?: string | null;
  nearestBusStop?: NearbyBusStop | null;
  currentRailStation: MyRailStation | null;
  currentBusStation: MyBusStation | null;
  onSelectRailStation: (station: MyRailStation) => void;
  onSelectBusStation: (station: MyBusStation) => void;
  onClear: () => void;
  onClose: () => void;
}

export function MyStationSetupModal({
  mode,
  railStations,
  userLocation,
  nearestRailStopId,
  nearestBusStop,
  currentRailStation,
  currentBusStation,
  onSelectRailStation,
  onSelectBusStation,
  onClear,
  onClose,
}: MyStationSetupModalProps) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [query, setQuery] = useState('');
  const [busResults, setBusResults] = useState<BusStopSearchItem[]>([]);
  const [loadingBus, setLoadingBus] = useState(false);

  useEffect(() => {
    if (mode) {
      setQuery('');
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'bus') return;
    let cancelled = false;
    setLoadingBus(true);
    const timer = window.setTimeout(() => {
      transitApi
        .searchBusStops(query, 24, userLocation?.lat, userLocation?.lon)
        .then((items) => {
          if (!cancelled) setBusResults(items);
        })
        .catch(() => {
          if (!cancelled) setBusResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingBus(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, query, userLocation?.lat, userLocation?.lon]);

  const filteredRail = useMemo(() => {
    if (mode !== 'rail') return [];
    const q = normalizeSearch(query);
    return railStations
      .filter((st) => {
        if (!q) return true;
        return (
          normalizeSearch(st.displayName).includes(q) ||
          normalizeSearch(st.stopId).includes(q) ||
          normalizeSearch(st.routeLongName).includes(q) ||
          normalizeSearch(st.routeShortName).includes(q)
        );
      })
      .slice(0, 40);
  }, [mode, query, railStations]);

  if (!mode) return null;

  const isRail = mode === 'rail';
  const hasCurrent = isRail ? !!currentRailStation : !!currentBusStation;
  const nearestRailObj = nearestRailStopId
    ? railStations.find((s) => s.stopId === nearestRailStopId) || null
    : null;

  return (
    <div
      className="fixed inset-0 z-[1120] flex items-end sm:items-center justify-center bg-slate-950/50 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="my-station-setup-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md max-h-[86dvh] flex flex-col bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden">
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <span className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="px-5 pt-2.5 pb-3.5 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-9 h-9 rounded-2xl text-white flex items-center justify-center shrink-0 ${
                isRail ? 'bg-blue-600' : 'bg-emerald-600'
              }`}
            >
              {isRail ? <TrainFront className="w-4.5 h-4.5" /> : <Bus className="w-4.5 h-4.5" />}
            </span>
            <div className="min-w-0">
              <h3
                id="my-station-setup-title"
                className="font-display text-base font-bold text-slate-950 truncate"
              >
                {isRail ? t.setupMyRailTitle : t.setupMyBusTitle}
              </h3>
              <p className="text-xs text-slate-500 truncate">
                {isRail ? t.setupMyRailSub : t.setupMyBusSub}
              </p>
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

        {/* Search + Quick Nearest GPS button */}
        <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isRail ? t.searchRailPlaceholder : t.busTripSearchPlaceholder}
              autoFocus
              className="w-full pl-10 pr-8 py-2.5 text-sm bg-white border border-slate-200 rounded-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            {isRail && nearestRailObj && (
              <button
                type="button"
                onClick={() => {
                  onSelectRailStation({
                    stopId: nearestRailObj.stopId,
                    displayName: nearestRailObj.displayName,
                    routeId: nearestRailObj.routeId,
                    routeShortName: nearestRailObj.routeShortName,
                    routeLongName: nearestRailObj.routeLongName,
                    routeColor: nearestRailObj.routeColor,
                    category: nearestRailObj.category,
                    lat: nearestRailObj.lat,
                    lon: nearestRailObj.lon,
                  });
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span>
                  {t.tripUseNearest}: {nearestRailObj.displayName}
                </span>
              </button>
            )}

            {!isRail && nearestBusStop && (
              <button
                type="button"
                onClick={() => {
                  onSelectBusStation({
                    stopId: nearestBusStop.stopId,
                    stopCode: nearestBusStop.stopCode,
                    stopName: nearestBusStop.stopName,
                    lat: nearestBusStop.lat,
                    lon: nearestBusStop.lon,
                    category: nearestBusStop.category,
                  });
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                <span className="truncate max-w-[230px]">
                  {t.busTripUseNearestStop}: {nearestBusStop.stopName}
                </span>
              </button>
            )}

            {hasCurrent && (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  onClose();
                }}
                className="ml-auto text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
              >
                {t.myStationClear}
              </button>
            )}
          </div>
        </div>

        {/* Station List */}
        <div className="flex-1 overflow-y-auto transit-scroll divide-y divide-slate-100">
          {isRail ? (
            filteredRail.map((st) => {
              const selected = currentRailStation?.stopId === st.stopId;
              return (
                <button
                  key={st.stopId}
                  type="button"
                  onClick={() => {
                    onSelectRailStation({
                      stopId: st.stopId,
                      displayName: st.displayName,
                      routeId: st.routeId,
                      routeShortName: st.routeShortName,
                      routeLongName: st.routeLongName,
                      routeColor: st.routeColor,
                      category: st.category,
                      lat: st.lat,
                      lon: st.lon,
                    });
                    onClose();
                  }}
                  className={`w-full px-5 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    selected ? 'bg-blue-50/90' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="shrink-0 min-w-[46px] text-center px-1.5 py-0.5 rounded-lg font-mono text-[11px] font-bold text-white"
                      style={{ backgroundColor: st.routeColor }}
                    >
                      {st.stopId}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {st.displayName}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {st.category} {st.routeLongName}
                      </div>
                    </div>
                  </div>
                  {selected && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-600 text-[10px] font-bold text-white shrink-0">
                      {t.myStationBadge}
                    </span>
                  )}
                </button>
              );
            })
          ) : loadingBus && busResults.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">{t.busTripLoadingIndex}</div>
          ) : busResults.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">{t.noStationsMatch}</div>
          ) : (
            busResults.map((stop) => {
              const selected = currentBusStation?.stopId === stop.stopId;
              return (
                <button
                  key={`${stop.category}-${stop.stopId}`}
                  type="button"
                  onClick={() => {
                    onSelectBusStation({
                      stopId: stop.stopId,
                      stopCode: stop.stopCode,
                      stopName: stop.stopName,
                      lat: stop.lat,
                      lon: stop.lon,
                      category: stop.category,
                    });
                    onClose();
                  }}
                  className={`w-full px-5 py-3 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    selected ? 'bg-emerald-50/90' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <MapPin className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900 truncate">
                        {stop.stopName}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 flex-wrap mt-0.5">
                        {stop.stopCode && <span className="font-mono">{stop.stopCode}</span>}
                        {stop.routeNames.slice(0, 5).map((r) => (
                          <span
                            key={r}
                            className="px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-mono text-[10px] font-bold"
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  {selected && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-[10px] font-bold text-white shrink-0">
                      {t.myStationBadge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
