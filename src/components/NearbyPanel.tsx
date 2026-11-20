import { ArrowLeft, ArrowRight, Bus, LocateFixed, MapPin, RotateCcw, TrainFront } from 'lucide-react';
import type { NearbyBusStop, NearbyTransitPayload, UserLocation } from '../types/transit';

interface NearbyPanelProps {
  userLocation: UserLocation | null;
  nearbyData: NearbyTransitPayload | null;
  locating: boolean;
  loadingNearby: boolean;
  locationError: string | null;
  isSimulatedKl: boolean;
  onRequestGps: () => void;
  onTryKlSample: () => void;
  onSelectStation: (stopId: string) => void;
  onSelectBusStop: (stop: NearbyBusStop) => void;
  onBack: () => void;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters / 1000).toLocaleString('vi-VN')} km`;
}

function formatWalk(meters: number, walkMinutes: number): string {
  if (meters > 15000) return 'Đường chim bay';
  if (walkMinutes <= 1) return '~1 phút đi bộ';
  if (walkMinutes < 60) return `~${walkMinutes} phút đi bộ`;
  const h = Math.floor(walkMinutes / 60);
  const m = walkMinutes % 60;
  return `~${h}g ${m}p đi bộ`;
}

export function NearbyPanel({
  userLocation,
  nearbyData,
  locating,
  loadingNearby,
  locationError,
  isSimulatedKl,
  onRequestGps,
  onTryKlSample,
  onSelectStation,
  onSelectBusStop,
  onBack,
}: NearbyPanelProps) {
  const isFarFromKl = (nearbyData?.distanceToKlCenterKm ?? 0) > 50;

  return (
    <div className="flex flex-col divide-y divide-slate-200">
      {/* Header */}
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quay lại danh sách</span>
          </button>

          <button
            type="button"
            onClick={onRequestGps}
            disabled={locating}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 rounded-lg cursor-pointer"
          >
            <LocateFixed className={`w-3.5 h-3.5 ${locating ? 'animate-spin' : ''}`} />
            <span>{locating ? 'Đang định vị…' : 'Định vị lại GPS'}</span>
          </button>
        </div>

        <div>
          <h2 className="font-display text-lg font-bold text-slate-950">
            Bến tàu & xe Bus gần bạn · Nearby GPS
          </h2>
          {userLocation && (
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {isSimulatedKl ? 'Vị trí thử tại Bukit Bintang KL · ' : 'GPS hiện tại · '}
              {userLocation.lat.toFixed(5)}, {userLocation.lon.toFixed(5)}
              {!isSimulatedKl && userLocation.accuracyMeters > 0
                ? ` (±${Math.round(userLocation.accuracyMeters)}m)`
                : ''}
            </p>
          )}
        </div>

        {locationError && (
          <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-2.5">
            <p className="text-xs font-medium text-red-900 leading-relaxed">{locationError}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onRequestGps}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Thử xin quyền GPS lại</span>
              </button>
              <button
                type="button"
                onClick={onTryKlSample}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <MapPin className="w-3 h-3" />
                <span>Thử tại trung tâm KL</span>
              </button>
            </div>
          </div>
        )}

        {isFarFromKl && !isSimulatedKl && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
            <p className="text-xs text-amber-950 leading-relaxed">
              Vị trí GPS hiện tại của bạn cách trung tâm Kuala Lumpur khoảng{' '}
              <strong className="font-mono tabular-nums">
                {Math.round(nearbyData!.distanceToKlCenterKm).toLocaleString('vi-VN')} km
              </strong>
              . Bạn vẫn xem được khoảng cách thật bên dưới, hoặc thử đặt vị trí mẫu tại trung tâm KL
              để kiểm tra khoảng cách đi bộ thực tế.
            </p>
            <button
              type="button"
              onClick={onTryKlSample}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-900 text-white rounded-lg hover:bg-amber-800 cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Thử vị trí tại Bukit Bintang, KL</span>
            </button>
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {(locating || loadingNearby) && !nearbyData && (
        <div className="p-5 space-y-3 animate-pulse">
          <div className="h-4 w-44 bg-slate-200 rounded" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl" />
          ))}
        </div>
      )}

      {/* Nearest Rail Stations */}
      {nearbyData && (
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
              <TrainFront className="w-4 h-4 text-slate-700" />
              <span>Ga MRT / LRT / Monorail gần nhất</span>
            </h3>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {nearbyData.railStations.length} ga
            </span>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
            {nearbyData.railStations.map((st) => (
              <button
                key={st.stopId}
                type="button"
                onClick={() => onSelectStation(st.stopId)}
                className="w-full px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="shrink-0 min-w-[46px] text-center px-1.5 py-0.5 rounded font-mono text-[11px] font-bold text-white tabular-nums"
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
                </div>

                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                      {formatDistance(st.distanceMeters)}
                    </div>
                    <div className="text-[11px] text-slate-500 whitespace-nowrap">
                      {formatWalk(st.distanceMeters, st.walkMinutes)}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nearest Bus Stops */}
      {nearbyData && (
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900 inline-flex items-center gap-1.5">
              <Bus className="w-4 h-4 text-sky-600" />
              <span>Trạm xe Bus Rapid KL gần nhất</span>
            </h3>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {nearbyData.busStops.length} trạm
            </span>
          </div>

          {nearbyData.busStops.length === 0 ? (
            <p className="text-xs text-slate-500">
              Đang đồng bộ danh mục trạm xe bus từ Prasarana… Vui lòng bấm Định vị lại sau vài giây.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {nearbyData.busStops.map((stop) => (
                <button
                  key={`${stop.category}-${stop.stopId}`}
                  type="button"
                  onClick={() => onSelectBusStop(stop)}
                  className="w-full px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MapPin
                      className={`w-4 h-4 shrink-0 ${
                        stop.category === 'rapid-bus-mrtfeeder'
                          ? 'text-indigo-600'
                          : 'text-sky-600'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {stop.stopName}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {stop.stopCode ? `${stop.stopCode} · ` : ''}
                        {stop.category === 'rapid-bus-mrtfeeder' ? 'MRT Feeder' : 'Rapid Bus KL'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                      {formatDistance(stop.distanceMeters)}
                    </div>
                    <div className="text-[11px] text-slate-500 whitespace-nowrap">
                      {formatWalk(stop.distanceMeters, stop.walkMinutes)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
