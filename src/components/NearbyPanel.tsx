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
    if (meters < 1000) return `${meters} m`;
    if (meters < 10000) return `${(meters / 1000).toFixed(2)} km`;
    return `${Math.round(meters / 1000).toLocaleString(locale)} km`;
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
    <div className="flex flex-col divide-y divide-slate-200/80 pb-6">
      {/* Header */}
      <div className="p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 active:scale-95 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t.backToList}</span>
          </button>

          <button
            type="button"
            onClick={onRequestGps}
            disabled={locating}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-60 rounded-full shadow-xs transition-all cursor-pointer"
          >
            <LocateFixed className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
            <span>{locating ? t.locatingEllipsis : t.relocateGps}</span>
          </button>
        </div>

        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">{t.nearbyTitle}</h2>
          {userLocation && (
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {isSimulatedKl ? t.simulatedKlLabel : t.currentGpsLabel}
              {userLocation.lat.toFixed(5)}, {userLocation.lon.toFixed(5)}
              {!isSimulatedKl && userLocation.accuracyMeters > 0
                ? ` (±${Math.round(userLocation.accuracyMeters)}m)`
                : ''}
            </p>
          )}
        </div>

        {/* 1-Tap Quick Directions Hero Cards (Google Maps / Waze / Apple Maps) */}
        {(closestRail || closestBus) && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50 to-sky-50/70 border border-blue-200/70 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>{t.nearestQuickDirTitle}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  className="p-3 rounded-2xl bg-white hover:bg-blue-50/40 active:scale-[0.98] border border-blue-200/80 shadow-2xs text-left flex items-center justify-between gap-2 transition-all cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-blue-700">
                      {t.nearestRailDir}
                    </div>
                    <div className="text-xs font-bold text-slate-950 truncate mt-0.5">
                      {closestRail.displayName}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {formatDistance(closestRail.distanceMeters)} ·{' '}
                      {formatWalk(closestRail.distanceMeters, closestRail.walkMinutes)}
                    </div>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Navigation className="w-3.5 h-3.5" />
                  </span>
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
                      color: '#0284C7',
                      lat: closestBus.lat,
                      lon: closestBus.lon,
                      kind: 'bus-stop',
                    })
                  }
                  className="p-3 rounded-2xl bg-white hover:bg-blue-50/40 active:scale-[0.98] border border-blue-200/80 shadow-2xs text-left flex items-center justify-between gap-2 transition-all cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-sky-700">
                      {t.nearestBusDir}
                    </div>
                    <div className="text-xs font-bold text-slate-950 truncate mt-0.5">
                      {closestBus.stopName}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                      {formatDistance(closestBus.distanceMeters)} ·{' '}
                      {formatWalk(closestBus.distanceMeters, closestBus.walkMinutes)}
                    </div>
                  </div>
                  <span className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0">
                    <Navigation className="w-3.5 h-3.5" />
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {locationError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-3">
            <p className="text-xs font-medium text-red-900 leading-relaxed">{locationError}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onRequestGps}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-full hover:bg-blue-700 active:scale-95 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t.retryGpsPerm}</span>
              </button>
              <button
                type="button"
                onClick={onTryKlSample}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-full hover:bg-slate-50 active:scale-95 transition-all cursor-pointer"
              >
                <MapPin className="w-3 h-3" />
                <span>{t.tryKlCenter}</span>
              </button>
            </div>
          </div>
        )}

        {isFarFromKl && !isSimulatedKl && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-2.5">
            <p className="text-xs text-amber-950 leading-relaxed">
              {t.farFromKlText(Math.round(nearbyData!.distanceToKlCenterKm).toLocaleString(locale))}
            </p>
            <button
              type="button"
              onClick={onTryKlSample}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-amber-900 text-white rounded-full hover:bg-amber-800 active:scale-95 transition-all cursor-pointer"
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
          <div className="h-4 w-44 bg-slate-200 rounded-full" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-2xl" />
          ))}
        </div>
      )}

      {/* Nearest Rail Stations */}
      {nearbyData && (
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
              <TrainFront className="w-4 h-4 text-blue-600" />
              <span>{t.nearestRailTitle}</span>
            </h3>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {t.stationsCount(nearbyData.railStations.length)}
            </span>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
            {nearbyData.railStations.map((st) => (
              <div
                key={st.stopId}
                className="px-3.5 py-3 flex items-center justify-between gap-2.5 hover:bg-slate-50 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onSelectStation(st.stopId)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <span
                    className="shrink-0 min-w-[46px] text-center px-1.5 py-0.5 rounded-lg font-mono text-[11px] font-bold text-white tabular-nums"
                    style={{ backgroundColor: st.routeColor }}
                  >
                    {st.stopId}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {st.displayName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {st.category} {st.routeLongName}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                      {formatDistance(st.distanceMeters)}
                    </div>
                    <div className="text-[11px] text-slate-500 whitespace-nowrap">
                      {formatWalk(st.distanceMeters, st.walkMinutes)}
                    </div>
                  </div>
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
                    title={t.directionsBtn}
                    className="w-8.5 h-8.5 inline-flex items-center justify-center rounded-full bg-blue-50 hover:bg-blue-100 active:scale-95 text-blue-600 transition-all cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nearest Bus Stops */}
      {nearbyData && (
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
              <Bus className="w-4 h-4 text-sky-600" />
              <span>{t.nearestBusTitle}</span>
            </h3>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {t.stopsCount(nearbyData.busStops.length)}
            </span>
          </div>

          {nearbyData.busStops.length === 0 ? (
            <p className="text-xs text-slate-500">{t.syncingBusStops}</p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
              {nearbyData.busStops.map((stop) => {
                const isMyStation = matchesMyBusStationStrict(stop, myBusStation);
                return (
                  <div
                    key={`${stop.category}-${stop.stopId}`}
                    className={`px-3.5 py-3 flex items-center justify-between gap-2 transition-colors ${
                      isMyStation ? 'bg-emerald-50/80' : 'hover:bg-slate-50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectBusStop(stop)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <MapPin
                        className={`w-4 h-4 shrink-0 ${
                          isMyStation
                            ? 'text-emerald-600'
                            : stop.category === 'rapid-bus-mrtfeeder'
                              ? 'text-indigo-600'
                              : 'text-sky-600'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {stop.stopName}
                          </p>
                          {isMyStation && (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-[9px] font-bold text-white shrink-0">
                              {t.myStationBadge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {stop.stopCode ? `${stop.stopCode} · ` : ''}
                          {stop.category === 'rapid-bus-mrtfeeder' ? 'MRT Feeder' : 'Rapid Bus KL'}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="text-right mr-0.5">
                        <div className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                          {formatDistance(stop.distanceMeters)}
                        </div>
                        <div className="text-[11px] text-slate-500 whitespace-nowrap">
                          {formatWalk(stop.distanceMeters, stop.walkMinutes)}
                        </div>
                      </div>

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
                        className={`w-8 h-8 inline-flex items-center justify-center rounded-full active:scale-95 transition-all cursor-pointer ${
                          isMyStation
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 hover:bg-emerald-50 text-slate-500 hover:text-emerald-700'
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
                            color: '#0284C7',
                            lat: stop.lat,
                            lon: stop.lon,
                            kind: 'bus-stop',
                          })
                        }
                        aria-label={t.directionsBtn}
                        title={t.directionsBtn}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-sky-50 hover:bg-sky-100 active:scale-95 text-sky-700 transition-all cursor-pointer"
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
