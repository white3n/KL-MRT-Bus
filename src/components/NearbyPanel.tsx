import {
  ArrowLeft,
  Bus,
  Home,
  LocateFixed,
  MapPin,
  Navigation,
  RotateCcw,
  TrainFront,
} from 'lucide-react';
import { matchesMyBusStationStrict, type MyBusStation } from '../hooks/useMyStations';
import { translations, useLanguage } from '../i18n';
import type { NearbyBusStop, NearbyTransitPayload, UserLocation } from '../types/transit';
import type { DirectionsTarget } from '../utils/directionsHelper';
import { getRailLineNumber, getTransitPalette } from '../utils/transitTheme';

interface NearbyPanelProps {
  userLocation: UserLocation | null;
  nearbyData: NearbyTransitPayload | null;
  myBusStation: MyBusStation | null;
  locating: boolean;
  loadingNearby: boolean;
  locationError: string | null;
  isSimulatedKl: boolean;
  onRequestGps: () => void;
  onTryKlSample: () => void;
  onSelectStation: (stopId: string) => void;
  onSelectBusStop: (stop: NearbyBusStop) => void;
  onSetMyBusStation: (station: MyBusStation) => void;
  onOpenDirections: (target: DirectionsTarget) => void;
  onBack: () => void;
}

export function NearbyPanel({
  userLocation,
  nearbyData,
  myBusStation,
  locating,
  loadingNearby,
  locationError,
  isSimulatedKl,
  onRequestGps,
  onTryKlSample,
  onSelectStation,
  onSelectBusStop,
  onSetMyBusStation,
  onOpenDirections,
  onBack,
}: NearbyPanelProps) {
  const { lang } = useLanguage();
  const t = translations[lang];
  const locale = lang === 'en' ? 'en-US' : 'vi-VN';

  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${meters}m`;
    if (meters < 10000) return `${(meters / 1000).toFixed(1)}km`;
    return `${Math.round(meters / 1000).toLocaleString(locale)}km`;
  };

  const formatWalk = (meters: number, walkMinutes: number): string => {
    if (meters > 15000) return t.straightLine;
    if (walkMinutes <= 1) return t.walk1Min;
    if (walkMinutes < 60) return t.walkMins(walkMinutes);
    const h = Math.floor(walkMinutes / 60);
    const m = walkMinutes % 60;
    return t.walkHoursMins(h, m);
  };

  const isFarFromKl = (nearbyData?.distanceToKlCenterKm ?? 0) > 50;
  const closestRail = nearbyData?.railStations[0] || null;
  const closestBus = nearbyData?.busStops[0] || null;

  return (
    <div className="flex flex-col min-h-full bg-[#0b0f17] text-white pb-8">
      {/* Header */}
      <div className="p-4 sm:p-5 space-y-3.5 border-b border-white/10">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-extrabold text-white bg-white/10 hover:bg-white/18 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.backToList}</span>
          </button>

          <button
            type="button"
            onClick={onRequestGps}
            disabled={locating}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-black bg-emerald-500 text-slate-950 hover:bg-emerald-400 active:scale-95 disabled:opacity-60 rounded-full shadow-xs transition-all cursor-pointer"
          >
            <LocateFixed className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
            <span>{locating ? t.locatingEllipsis : t.relocateGps}</span>
          </button>
        </div>

        <div>
          <h2 className="font-display text-2xl font-black text-white">{t.nearbyTitle}</h2>
          {userLocation && (
            <p className="mt-0.5 text-xs text-slate-400 font-mono tabular-nums">
              {isSimulatedKl ? t.simulatedKlLabel : t.currentGpsLabel}
              {userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}
            </p>
          )}
        </div>

        {/* 1-Tap Quick GO Cards (Google Maps / Waze / Apple Maps) */}
        {(closestRail || closestBus) && (
          <div className="grid grid-cols-2 gap-2">
            {closestRail && (
              <button
                type="button"
                onClick={() =>
                  onOpenDirections({
                    name: closestRail.displayName,
                    subtitle: `${closestRail.category} ${closestRail.routeLongName}`,
                    badge: closestRail.stopId,
                    color: closestRail.routeColor,
                    lat: closestRail.lat,
                    lon: closestRail.lon,
                    kind: 'rail',
                  })
                }
                className="p-3.5 rounded-3xl bg-[#052919] border border-emerald-500/25 active:scale-[0.98] text-left space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-extrabold text-emerald-300 truncate">
                    {t.nearestRailDir}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500 text-slate-950 text-[10px] font-black italic">
                    GO
                  </span>
                </div>
                <div className="text-sm font-black text-white truncate">
                  {closestRail.displayName}
                </div>
                <div className="text-xs font-bold text-emerald-200/80 font-mono">
                  {formatDistance(closestRail.distanceMeters)} · {closestRail.walkMinutes}m
                </div>
              </button>
            )}

            {closestBus && (
              <button
                type="button"
                onClick={() =>
                  onOpenDirections({
                    name: closestBus.stopName,
                    subtitle:
                      closestBus.category === 'rapid-bus-mrtfeeder'
                        ? 'MRT Feeder Bus Stop'
                        : 'Rapid Bus KL Stop',
                    badge: closestBus.stopCode || 'BUS',
                    color: '#2563eb',
                    lat: closestBus.lat,
                    lon: closestBus.lon,
                    kind: 'bus-stop',
                  })
                }
                className="p-3.5 rounded-3xl bg-[#071b3d] border border-blue-400/25 active:scale-[0.98] text-left space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-extrabold text-sky-300 truncate">
                    {t.nearestBusDir}
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-blue-500 text-white text-[10px] font-black italic">
                    GO
                  </span>
                </div>
                <div className="text-sm font-black text-white truncate">{closestBus.stopName}</div>
                <div className="text-xs font-bold text-sky-200/80 font-mono">
                  {formatDistance(closestBus.distanceMeters)} · {closestBus.walkMinutes}m
                </div>
              </button>
            )}
          </div>
        )}

        {locationError && (
          <div className="p-4 bg-red-950/60 border border-red-500/30 rounded-3xl space-y-3">
            <p className="text-xs font-bold text-red-100 leading-relaxed">{locationError}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onRequestGps}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black bg-emerald-500 text-slate-950 rounded-full active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t.retryGpsPerm}</span>
              </button>
              <button
                type="button"
                onClick={onTryKlSample}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-extrabold bg-white/12 text-white rounded-full active:scale-95 cursor-pointer"
              >
                <MapPin className="w-3 h-3" />
                <span>{t.tryKlCenter}</span>
              </button>
            </div>
          </div>
        )}

        {isFarFromKl && !isSimulatedKl && (
          <div className="p-3.5 bg-amber-950/60 border border-amber-400/30 rounded-3xl space-y-2.5">
            <p className="text-xs font-bold text-amber-100 leading-relaxed">
              {t.farFromKlText(Math.round(nearbyData!.distanceToKlCenterKm).toLocaleString(locale))}
            </p>
            <button
              type="button"
              onClick={onTryKlSample}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black bg-amber-400 text-slate-950 rounded-full active:scale-95 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>{t.tryBukitBintang}</span>
            </button>
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {(locating || loadingNearby) && !nearbyData && (
        <div className="p-5 space-y-3 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-18 bg-white/8 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Nearest Rail Stations (Color-Coded Transit Bands) */}
      {nearbyData && (
        <div className="pt-4 space-y-2">
          <div className="px-4 flex items-center justify-between">
            <h3 className="font-display text-xs font-black uppercase tracking-wider text-slate-400 inline-flex items-center gap-1.5">
              <TrainFront className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.nearestRailTitle}</span>
            </h3>
            <span className="font-mono text-[11px] font-bold text-slate-500">
              {t.stationsCount(nearbyData.railStations.length)}
            </span>
          </div>

          <div className="divide-y divide-black/35">
            {nearbyData.railStations.map((st) => {
              const pal = getTransitPalette(st.routeColor, 'rail', st.routeId);
              const lineNum = getRailLineNumber(st.routeId, st.routeShortName);
              return (
                <div
                  key={st.stopId}
                  className="px-4 py-3.5 flex items-center justify-between gap-2.5"
                  style={{ backgroundColor: pal.bandBg }}
                >
                  <button
                    type="button"
                    onClick={() => onSelectStation(st.stopId)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <span
                      className="shrink-0 w-9 h-9 rounded-full text-sm font-black text-slate-950 flex items-center justify-center"
                      style={{ backgroundColor: pal.accent }}
                    >
                      {lineNum}
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-black text-white truncate">{st.displayName}</p>
                      <p className="text-xs font-bold truncate" style={{ color: pal.muted }}>
                        {st.stopId} · {formatWalk(st.distanceMeters, st.walkMinutes)}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="font-display text-lg font-black tabular-nums"
                      style={{ color: pal.accent }}
                    >
                      {formatDistance(st.distanceMeters)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenDirections({
                          name: st.displayName,
                          subtitle: `${st.category} ${st.routeLongName}`,
                          badge: st.stopId,
                          color: st.routeColor,
                          lat: st.lat,
                          lon: st.lon,
                          kind: 'rail',
                        })
                      }
                      aria-label={t.directionsBtn}
                      className="w-8.5 h-8.5 inline-flex items-center justify-center rounded-full bg-white/14 hover:bg-white/22 text-white active:scale-95 cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Nearest Bus Stops */}
      {nearbyData && (
        <div className="pt-5 space-y-2">
          <div className="px-4 flex items-center justify-between">
            <h3 className="font-display text-xs font-black uppercase tracking-wider text-slate-400 inline-flex items-center gap-1.5">
              <Bus className="w-3.5 h-3.5 text-sky-400" />
              <span>{t.nearestBusTitle}</span>
            </h3>
            <span className="font-mono text-[11px] font-bold text-slate-500">
              {t.stopsCount(nearbyData.busStops.length)}
            </span>
          </div>

          {nearbyData.busStops.length === 0 ? (
            <p className="px-4 text-xs text-slate-400">{t.syncingBusStops}</p>
          ) : (
            <div className="divide-y divide-black/35">
              {nearbyData.busStops.map((stop) => {
                const isMyStation = matchesMyBusStationStrict(stop, myBusStation);
                const pal = getTransitPalette(
                  stop.category === 'rapid-bus-mrtfeeder' ? '#ef4436' : '#2563eb',
                  stop.category === 'rapid-bus-mrtfeeder' ? 'feeder' : 'rapid-bus'
                );
                return (
                  <div
                    key={`${stop.category}-${stop.stopId}`}
                    className="px-4 py-3.5 flex items-center justify-between gap-2"
                    style={{ backgroundColor: pal.bandBg }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectBusStop(stop)}
                      className="min-w-0 flex-1 text-left cursor-pointer space-y-0.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-black text-white truncate">{stop.stopName}</p>
                        {isMyStation && (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-400 text-slate-950 text-[9px] font-black shrink-0">
                            {t.myStationBadge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold truncate" style={{ color: pal.muted }}>
                        {formatDistance(stop.distanceMeters)} ·{' '}
                        {formatWalk(stop.distanceMeters, stop.walkMinutes)}
                      </p>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onSetMyBusStation({
                            stopId: stop.stopId,
                            stopCode: stop.stopCode,
                            stopName: stop.stopName,
                            lat: stop.lat,
                            lon: stop.lon,
                            category: stop.category,
                          })
                        }
                        aria-label={t.setMyStation}
                        title={t.setMyStation}
                        className={`w-8.5 h-8.5 inline-flex items-center justify-center rounded-full active:scale-95 transition-all cursor-pointer ${
                          isMyStation
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-white/14 text-white hover:bg-white/22'
                        }`}
                      >
                        <Home className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onOpenDirections({
                            name: stop.stopName,
                            subtitle:
                              stop.category === 'rapid-bus-mrtfeeder'
                                ? 'MRT Feeder Bus Stop'
                                : 'Rapid Bus KL Stop',
                            badge: stop.stopCode || 'BUS',
                            color: pal.vivid,
                            lat: stop.lat,
                            lon: stop.lon,
                            kind: 'bus-stop',
                          })
                        }
                        aria-label={t.directionsBtn}
                        className="w-8.5 h-8.5 inline-flex items-center justify-center rounded-full bg-white/14 hover:bg-white/22 text-white active:scale-95 cursor-pointer"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
