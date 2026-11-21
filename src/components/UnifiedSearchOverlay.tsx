import {
  ArrowLeft,
  ArrowUpDown,
  Bus,
  Home,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  TrainFront,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { translations, useLanguage } from '../i18n';
import { searchKlPlaces, type KlPlaceResult } from '../services/placeSearch';
import { transitApi } from '../services/transitApi';
import type { BusStopSearchItem, LiveBusVehicle, RailStation, UserLocation } from '../types/transit';
import { getRailLineNumber, getTransitPalette } from '../utils/transitTheme';
import { normalizeSearch, POPULAR_KL_HUBS } from '../utils/transitHelpers';

interface UnifiedSearchOverlayProps {
  open: boolean;
  pickTarget?: 'default' | 'origin' | 'destination';
  stations: RailStation[];
  liveVehicles: LiveBusVehicle[];
  userLocation: UserLocation | null;
  onClose: () => void;
  onSelectStation: (stopId: string) => void;
  onSelectBus: (bus: LiveBusVehicle) => void;
  onSelectBusStop: (stop: BusStopSearchItem) => void;
  onSelectPlaceForJourney: (place: KlPlaceResult) => void;
  onOpenTripPlanner: () => void;
  onOpenNearby: () => void;
  onOpenMyRailSetup: () => void;
  onOpenMyBusSetup: () => void;
}

export function UnifiedSearchOverlay({
  open,
  pickTarget = 'default',
  stations,
  liveVehicles,
  userLocation,
  onClose,
  onSelectStation,
  onSelectBus,
  onSelectBusStop,
  onSelectPlaceForJourney,
  onOpenTripPlanner,
  onOpenNearby,
  onOpenMyRailSetup,
  onOpenMyBusSetup,
}: UnifiedSearchOverlayProps) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const [query, setQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<KlPlaceResult[]>([]);
  const [busStopResults, setBusStopResults] = useState<BusStopSearchItem[]>([]);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isPickingEndpoint = pickTarget === 'origin' || pickTarget === 'destination';

  useEffect(() => {
    if (open) {
      setQuery('');
      setPlaceResults([]);
      setBusStopResults([]);
      window.setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Live search BOTH real KL Places (malls, condos, addresses via Photon) AND Bus Stops
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setPlaceResults([]);
      setBusStopResults([]);
      return;
    }
    let cancelled = false;
    setSearchingRemote(true);
    const timer = window.setTimeout(() => {
      Promise.all([
        searchKlPlaces(trimmed, userLocation?.lat ?? 3.1478, userLocation?.lon ?? 101.6953, 6),
        transitApi
          .searchBusStops(trimmed, 6, userLocation?.lat, userLocation?.lon)
          .catch(() => [] as BusStopSearchItem[]),
      ])
        .then(([places, stops]) => {
          if (!cancelled) {
            setPlaceResults(places);
            setBusStopResults(stops);
          }
        })
        .finally(() => {
          if (!cancelled) setSearchingRemote(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, userLocation?.lat, userLocation?.lon]);

  const matchedBuses = useMemo(() => {
    if (isPickingEndpoint) return [];
    const q = normalizeSearch(query);
    if (!q) return [];
    const seen = new Map<string, LiveBusVehicle>();
    for (const v of liveVehicles) {
      const hit =
        normalizeSearch(v.routeShortName).includes(q) ||
        normalizeSearch(v.headsign).includes(q) ||
        normalizeSearch(v.routeLongName).includes(q);
      if (!hit) continue;
      const key = `${v.routeShortName.toUpperCase()}:${v.headsign}`;
      const prev = seen.get(key);
      if (!prev || v.updatedSecondsAgo < prev.updatedSecondsAgo) {
        seen.set(key, v);
      }
    }
    return Array.from(seen.values())
      .sort((a, b) => a.routeShortName.localeCompare(b.routeShortName, undefined, { numeric: true }))
      .slice(0, 5);
  }, [liveVehicles, query, isPickingEndpoint]);

  const matchedStations = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return [];
    return stations
      .filter(
        (s) =>
          normalizeSearch(s.displayName).includes(q) ||
          normalizeSearch(s.stopId).includes(q) ||
          normalizeSearch(s.routeLongName).includes(q)
      )
      .slice(0, 6);
  }, [stations, query]);

  if (!open) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[1070] flex flex-col bg-[#0b0f17] text-white safe-area-shell">
      {/* Transit App Iconic Green Search Header */}
      <div className="bg-[#166534] px-3 py-3 shadow-lg flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label={t.backToList}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/15 active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="relative flex-1 min-w-0 flex items-center">
          <Search className="w-4.5 h-4.5 text-emerald-100/80 absolute left-3 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              pickTarget === 'origin'
                ? lang === 'en'
                  ? 'Pick starting place…'
                  : 'Chọn điểm xuất phát…'
                : pickTarget === 'destination'
                  ? lang === 'en'
                    ? 'Pick destination (AEON, Pavilion, TRX)…'
                    : 'Chọn điểm đến (AEON, Pavilion, TRX)…'
                  : lang === 'en'
                    ? 'Place, mall, station, or bus (Pavilion, AEON, T401)…'
                    : 'Tìm địa điểm, mall, ga tàu, tuyến bus (AEON, Pavilion)…'
            }
            className="w-full pl-9 pr-8 py-2.5 rounded-2xl bg-black/20 text-sm sm:text-base font-extrabold text-white placeholder:text-emerald-100/75 focus:outline-none focus:bg-black/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t.clearSearchAria}
              className="absolute right-2 p-1 text-emerald-100 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {!isPickingEndpoint && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenTripPlanner();
            }}
            aria-label={t.tripPlanner}
            title={t.tripPlanner}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/15 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <ArrowUpDown className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Scrollable Results / Quick Shortcuts */}
      <div className="flex-1 overflow-y-auto transit-scroll divide-y divide-white/8">
        {!hasQuery ? (
          <>
            {/* Quick Action Rows */}
            <div className="p-3 space-y-2">
              {isPickingEndpoint && userLocation && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectPlaceForJourney({
                      id: 'gps:current',
                      name: lang === 'en' ? 'Current location' : 'Vị trí GPS hiện tại',
                      subtitle: `${userLocation.lat.toFixed(4)}, ${userLocation.lon.toFixed(4)}`,
                      lat: userLocation.lat,
                      lon: userLocation.lon,
                      kind: 'gps',
                    });
                  }}
                  className="w-full px-4 py-3.5 rounded-2xl bg-emerald-950/60 border border-emerald-500/30 flex items-center gap-3 text-left cursor-pointer"
                >
                  <LocateFixed className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-sm font-black text-white">
                      {lang === 'en' ? 'Current location (GPS)' : 'Vị trí GPS hiện tại'}
                    </div>
                    <div className="text-xs text-emerald-200/80">Kuala Lumpur</div>
                  </div>
                </button>
              )}

              {!isPickingEndpoint && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenNearby();
                    }}
                    className="w-full px-4 py-3.5 rounded-2xl bg-[#161e2e] hover:bg-[#1e293b] active:scale-[0.99] flex items-center gap-3 text-left transition-all cursor-pointer"
                  >
                    <span className="w-9 h-9 rounded-xl bg-sky-500 text-slate-950 flex items-center justify-center shrink-0">
                      <LocateFixed className="w-4.5 h-4.5 stroke-[2.5]" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white">{t.navNearby}</div>
                      <div className="text-xs text-slate-400 truncate">
                        {lang === 'en'
                          ? 'Nearest MRT/LRT & Bus stops via GPS'
                          : 'Tìm ga tàu & trạm bus gần vị trí GPS'}
                      </div>
                    </div>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenMyRailSetup();
                      }}
                      className="px-3.5 py-3 rounded-2xl bg-[#161e2e] hover:bg-[#1e293b] active:scale-[0.98] flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <Home className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-xs font-extrabold text-white truncate">
                        {t.myRailStationLabel}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenMyBusSetup();
                      }}
                      className="px-3.5 py-3 rounded-2xl bg-[#161e2e] hover:bg-[#1e293b] active:scale-[0.98] flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <Home className="w-4 h-4 text-rose-400 shrink-0" />
                      <span className="text-xs font-extrabold text-white truncate">
                        {t.myBusStationLabel}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Popular KL Destinations (1-Tap Multimodal Journey Plan!) */}
            <div className="p-4 space-y-2.5">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                {lang === 'en' ? 'Popular Places in KL (Route A → B)' : 'Địa điểm nổi bật tại KL (Tìm đường A → B)'}
              </div>
              <div className="space-y-1.5">
                {[
                  { id: 'kl:pavilion', name: 'Pavilion Kuala Lumpur', subtitle: 'Bukit Bintang', lat: 3.14915, lon: 101.71295 },
                  { id: 'kl:aeon-maluri', name: 'AEON Taman Maluri', subtitle: 'Jalan Jejaka, Cheras', lat: 3.12582, lon: 101.72818 },
                  { id: 'kl:klcc', name: 'Suria KLCC / Petronas Towers', subtitle: 'KL City Centre', lat: 3.15785, lon: 101.71225 },
                  { id: 'kl:trx', name: 'The Exchange TRX', subtitle: 'Tun Razak Exchange', lat: 3.1422, lon: 101.7186 },
                  { id: 'kl:midvalley', name: 'Mid Valley Megamall', subtitle: 'Lingkaran Syed Putra', lat: 3.11766, lon: 101.67737 },
                ].map((place) => (
                  <button
                    key={place.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      onSelectPlaceForJourney({ ...place, kind: 'place' });
                    }}
                    className="w-full px-3.5 py-3 rounded-2xl bg-[#111723] hover:bg-[#192235] flex items-center gap-3 text-left active:scale-[0.99] cursor-pointer"
                  >
                    <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black text-white truncate">{place.name}</div>
                      <div className="text-xs text-slate-400 truncate">{place.subtitle}</div>
                    </div>
                    <Navigation className="w-4 h-4 text-emerald-400 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Popular KL Rail Hubs */}
            {!isPickingEndpoint && (
              <div className="p-4 space-y-2.5">
                <div className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  {t.popularHubs}
                </div>
                <div className="space-y-1.5">
                  {POPULAR_KL_HUBS.map((hub) => {
                    const st = stations.find((s) => s.stopId === hub.stopId);
                    const pal = getTransitPalette(st?.routeColor || '#047857', 'rail', st?.routeId);
                    const lineNum = st ? getRailLineNumber(st.routeId, st.routeShortName) : '9';
                    return (
                      <button
                        key={hub.stopId}
                        type="button"
                        onClick={() => {
                          onClose();
                          onSelectStation(hub.stopId);
                        }}
                        className="w-full px-3.5 py-3 rounded-2xl bg-[#111723] hover:bg-[#192235] flex items-center gap-3 text-left active:scale-[0.99] cursor-pointer"
                      >
                        <span
                          className="w-8 h-8 rounded-full text-xs font-black text-slate-950 flex items-center justify-center shrink-0"
                          style={{ backgroundColor: pal.accent }}
                        >
                          {lineNum}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-white truncate">{hub.label}</div>
                          <div className="text-xs text-slate-400 truncate">
                            {hub.stopId} · {hub.sub}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="p-3 space-y-4">
            {/* 1. REAL PLACES / MALLS / ADDRESSES (Tap -> Multimodal Bus+Rail+Walk Journey Planner!) */}
            {(placeResults.length > 0 || searchingRemote) && (
              <div className="space-y-1.5">
                <div className="px-1 text-[11px] font-black uppercase tracking-wider text-emerald-400">
                  {lang === 'en' ? 'Places & Destinations (Route A → B)' : 'Địa điểm & Điểm đến (Tìm đường đi)'}
                </div>
                {searchingRemote && placeResults.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-slate-400">
                    {lang === 'en' ? 'Searching KL places…' : 'Đang tìm địa điểm tại KL…'}
                  </div>
                ) : (
                  placeResults.map((place) => (
                    <button
                      key={place.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectPlaceForJourney(place);
                      }}
                      className="w-full px-3.5 py-3 rounded-2xl bg-[#111723] hover:bg-[#192235] border border-emerald-500/20 flex items-center gap-3 text-left active:scale-[0.99] cursor-pointer"
                    >
                      <span className="w-8.5 h-8.5 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 stroke-[2.5]" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-white truncate">{place.name}</div>
                        <div className="text-xs text-slate-400 truncate">{place.subtitle}</div>
                      </div>
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 text-[11px] font-black shrink-0">
                        {lang === 'en' ? 'Route' : 'Đi tới'}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* 2. Matching Live Buses */}
            {matchedBuses.length > 0 && (
              <div className="space-y-1.5">
                <div className="px-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  {lang === 'en' ? 'Live Bus Lines' : 'Tuyến xe Bus đang chạy'}
                </div>
                {matchedBuses.map((bus) => {
                  const pal = getTransitPalette(
                    bus.color,
                    bus.category === 'rapid-bus-mrtfeeder' ? 'feeder' : 'rapid-bus'
                  );
                  return (
                    <button
                      key={bus.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectBus(bus);
                      }}
                      className="w-full px-3.5 py-3 rounded-2xl flex items-center gap-3 text-left active:brightness-110 cursor-pointer"
                      style={{ backgroundColor: pal.bandBg }}
                    >
                      <span
                        className="px-2.5 py-1 rounded-xl text-sm font-black text-white shrink-0"
                        style={{ backgroundColor: pal.vivid }}
                      >
                        {bus.routeShortName}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-white truncate">
                          {bus.headsign || bus.routeLongName}
                        </div>
                        <div className="text-xs font-bold" style={{ color: pal.muted }}>
                          {bus.speedKmh} km/h · {bus.updatedSecondsAgo}s
                        </div>
                      </div>
                      <Bus className="w-4 h-4 shrink-0" style={{ color: pal.accent }} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 3. Matching Rail Stations */}
            {matchedStations.length > 0 && (
              <div className="space-y-1.5">
                <div className="px-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  {lang === 'en' ? 'MRT / LRT Stations' : 'Ga tàu MRT / LRT'}
                </div>
                {matchedStations.map((st) => {
                  const lineNum = getRailLineNumber(st.routeId, st.routeShortName);
                  return (
                    <div
                      key={st.stopId}
                      className="px-3.5 py-3 rounded-2xl bg-[#111723] hover:bg-[#192235] flex items-center gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          if (isPickingEndpoint) {
                            onSelectPlaceForJourney({
                              id: `rail:${st.stopId}`,
                              name: `${st.category} ${st.displayName}`,
                              subtitle: st.routeLongName,
                              lat: st.lat,
                              lon: st.lon,
                              kind: 'station',
                            });
                          } else {
                            onSelectStation(st.stopId);
                          }
                        }}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <span
                          className="w-8 h-8 rounded-full text-xs font-black text-white flex items-center justify-center shrink-0"
                          style={{ backgroundColor: st.routeColor }}
                        >
                          {lineNum}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-white truncate">
                            {st.displayName}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
                            {st.stopId} · {st.category} {st.routeLongName}
                          </div>
                        </div>
                      </button>
                      {!isPickingEndpoint && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onSelectPlaceForJourney({
                              id: `rail:${st.stopId}`,
                              name: `${st.category} ${st.displayName}`,
                              subtitle: st.routeLongName,
                              lat: st.lat,
                              lon: st.lon,
                              kind: 'station',
                            });
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-emerald-500 hover:text-slate-950 text-xs font-extrabold text-emerald-300 shrink-0 cursor-pointer"
                        >
                          {lang === 'en' ? 'Route' : 'Đi tới'}
                        </button>
                      )}
                      {isPickingEndpoint && <TrainFront className="w-4 h-4 text-slate-400 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 4. Matching Bus Stops with Route Badges */}
            {busStopResults.length > 0 && (
              <div className="space-y-1.5">
                <div className="px-1 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  {lang === 'en' ? 'Bus Stops' : 'Trạm dừng xe Bus'}
                </div>
                {busStopResults.map((stop) => (
                  <div
                    key={`${stop.category}-${stop.stopId}`}
                    className="px-3.5 py-3 rounded-2xl bg-[#111723] hover:bg-[#192235] flex items-start gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (isPickingEndpoint) {
                          onSelectPlaceForJourney({
                            id: `bus:${stop.stopId}`,
                            name: stop.stopName,
                            subtitle: stop.stopCode || 'Rapid KL Bus Stop',
                            lat: stop.lat,
                            lon: stop.lon,
                            kind: 'bus-stop',
                          });
                        } else {
                          onSelectBusStop(stop);
                        }
                      }}
                      className="flex items-start gap-3 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <MapPin className="w-4.5 h-4.5 text-sky-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-sm font-black text-white truncate">
                          {stop.stopCode ? `${stop.stopCode} ` : ''}
                          {stop.stopName}
                        </div>
                        {stop.routeNames.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {stop.routeNames.slice(0, 6).map((r) => (
                              <span
                                key={r}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-black text-white ${
                                  r.startsWith('T') ? 'bg-[#dc2626]' : 'bg-[#2563eb]'
                                }`}
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                    {!isPickingEndpoint && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSelectPlaceForJourney({
                            id: `bus:${stop.stopId}`,
                            name: stop.stopName,
                            subtitle: stop.stopCode || 'Rapid KL Bus Stop',
                            lat: stop.lat,
                            lon: stop.lon,
                            kind: 'bus-stop',
                          });
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-emerald-500 hover:text-slate-950 text-xs font-extrabold text-emerald-300 shrink-0 cursor-pointer"
                      >
                        {lang === 'en' ? 'Route' : 'Đi tới'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!searchingRemote &&
              placeResults.length === 0 &&
              matchedBuses.length === 0 &&
              matchedStations.length === 0 &&
              busStopResults.length === 0 && (
                <div className="p-8 text-center text-sm font-bold text-slate-400">
                  {t.noStationsMatch}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
