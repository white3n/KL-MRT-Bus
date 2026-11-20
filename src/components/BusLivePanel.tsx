import { ArrowLeft, Compass, Gauge, MapPin, Navigation, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import type {
  BusCategory,
  BusRouteDetailPayload,
  LiveBusesPayload,
  LiveBusVehicle,
} from '../types/transit';
import { bearingToCompassVi, haversineKm, normalizeSearch } from '../utils/transitHelpers';

interface BusLivePanelProps {
  data: LiveBusesPayload | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  busCategoryFilter: 'all' | BusCategory;
  selectedBus: LiveBusVehicle | null;
  selectedBusRouteDetail: BusRouteDetailPayload | null;
  loadingRouteDetail: boolean;
  onCategoryChange: (cat: 'all' | BusCategory) => void;
  onSelectBus: (vehicle: LiveBusVehicle | null) => void;
  onRetry: () => void;
}

export function BusLivePanel({
  data,
  loading,
  error,
  searchQuery,
  busCategoryFilter,
  selectedBus,
  selectedBusRouteDetail,
  loadingRouteDetail,
  onCategoryChange,
  onSelectBus,
  onRetry,
}: BusLivePanelProps) {
  const filteredVehicles = useMemo(() => {
    if (!data) return [];
    const q = normalizeSearch(searchQuery);
    return data.vehicles
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
  }, [data, busCategoryFilter, searchQuery]);

  // Compute nearest upcoming stops along selected bus route based on live GPS
  const stopsWithDistance = useMemo(() => {
    if (!selectedBus || !selectedBusRouteDetail?.stops.length) return [];
    const stops = selectedBusRouteDetail.stops;
    let closestIdx = 0;
    let minDist = Number.POSITIVE_INFINITY;
    const withDist = stops.map((s, idx) => {
      const distKm = haversineKm(selectedBus.lat, selectedBus.lon, s.lat, s.lon);
      if (distKm < minDist) {
        minDist = distKm;
        closestIdx = idx;
      }
      return { ...s, distKm, isClosest: false, etaMin: 0 };
    });

    // Show from 1 stop before closest to 8 stops ahead
    const start = Math.max(0, closestIdx);
    const slice = withDist.slice(start, start + 10);
    const effectiveSpeedKmh = selectedBus.speedKmh >= 8 ? selectedBus.speedKmh : 20;
    return slice.map((item, i) => ({
      ...item,
      isClosest: i === 0,
      etaMin: Math.max(1, Math.round((item.distKm / effectiveSpeedKmh) * 60)),
    }));
  }, [selectedBus, selectedBusRouteDetail]);

  if (selectedBus) {
    return (
      <div className="flex flex-col divide-y divide-slate-200">
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectBus(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Danh sách xe bus đang chạy</span>
            </button>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              GPS {selectedBus.updatedSecondsAgo}s trước
            </span>
          </div>

          <div className="flex items-start gap-3">
            <span
              className="shrink-0 mt-0.5 px-2.5 py-1 rounded-md font-mono text-sm font-bold text-white tabular-nums"
              style={{ backgroundColor: selectedBus.color }}
            >
              {selectedBus.routeShortName}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-slate-950 leading-snug">
                {selectedBus.headsign || selectedBus.routeLongName}
              </h2>
              <p className="mt-1 text-xs text-slate-500 flex items-center flex-wrap gap-1.5">
                <span className="font-medium text-slate-700">
                  {selectedBus.category === 'rapid-bus-mrtfeeder'
                    ? 'MRT Feeder Bus'
                    : 'Rapid Bus KL'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">Biển số {selectedBus.licensePlate}</span>
              </p>
            </div>
          </div>

          {/* Real-time GPS telemetry row */}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Gauge className="w-3 h-3" />
                <span>Tốc độ</span>
              </div>
              <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums">
                {selectedBus.speedKmh} <span className="text-xs font-normal text-slate-500">km/h</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Compass className="w-3 h-3" />
                <span>Hướng chạy</span>
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-900 truncate">
                {bearingToCompassVi(selectedBus.bearing)}
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                <Navigation className="w-3 h-3" />
                <span>Tọa độ GPS</span>
              </div>
              <div className="mt-1 font-mono text-[11px] font-medium text-slate-700 tabular-nums truncate">
                {selectedBus.lat.toFixed(4)}, {selectedBus.lon.toFixed(4)}
              </div>
            </div>
          </div>
        </div>

        {/* Upcoming Bus Stops along Route */}
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-slate-900">
              Các trạm dừng gần & sắp tới
            </h3>
            {loadingRouteDetail && <span className="text-xs text-slate-400">Đang tải trạm…</span>}
          </div>

          {!loadingRouteDetail && stopsWithDistance.length === 0 ? (
            <p className="text-xs text-slate-500 leading-relaxed">
              Xe đang phát tín hiệu GPS trực tiếp trên bản đồ. Lộ trình chi tiết các trạm dừng của
              chuyến này đang được đồng bộ từ dữ liệu tĩnh Prasarana.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {stopsWithDistance.map((stop) => (
                <div
                  key={`${stop.stopId}-${stop.sequence}`}
                  className={`px-3.5 py-2.5 flex items-center justify-between gap-3 ${
                    stop.isClosest ? 'bg-sky-50/70' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <MapPin
                      className={`w-3.5 h-3.5 shrink-0 ${
                        stop.isClosest ? 'text-sky-600' : 'text-slate-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {stop.stopName}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {stop.stopCode ? `${stop.stopCode} · ` : ''}
                        Cách {stop.distKm < 1 ? `${Math.round(stop.distKm * 1000)}m` : `${stop.distKm.toFixed(1)}km`}
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums shrink-0">
                    {stop.isClosest && stop.distKm < 0.15 ? 'Gần trạm' : `~${stop.etaMin} phút`}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Vị trí GPS thật từ luồng GTFS Realtime Protobuf của api.data.gov.my (tự làm mới mỗi 5
            giây). Thời gian đến trạm được ước tính theo khoảng cách và tốc độ thực tế.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-slate-200">
      {/* Category Filter + Live Stats */}
      <div className="p-4 space-y-3 bg-slate-50/60">
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/70 rounded-lg">
          {[
            { id: 'all' as const, label: `Tất cả (${data?.counts.total ?? 0})` },
            { id: 'rapid-bus-kl' as const, label: `Rapid KL (${data?.counts.rapidBusKl ?? 0})` },
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
                className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
                  active
                    ? 'bg-white text-slate-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Nguồn: GTFS Realtime Protobuf · api.data.gov.my</span>
          <span className="font-mono tabular-nums">Tự động 5s</span>
        </div>

        {data?.staleWarning && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            {data.staleWarning}
          </div>
        )}
      </div>

      {/* Loading / Error / Vehicle List */}
      <div className="p-4 space-y-2.5">
        {loading && !data ? (
          <div className="space-y-2.5 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-xl" />
            ))}
          </div>
        ) : error && !data ? (
          <div className="p-4 border border-red-200 bg-red-50 rounded-xl space-y-3">
            <p className="text-sm text-red-900 font-medium">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Thử kết nối lại</span>
            </button>
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="p-6 text-center border border-slate-200 rounded-xl space-y-2">
            <p className="text-sm font-medium text-slate-800">
              Không tìm thấy xe bus đang hoạt động phù hợp
            </p>
            <p className="text-xs text-slate-500">
              {searchQuery
                ? `Thử xóa bộ lọc "${searchQuery}" hoặc kiểm tra mã tuyến khác (ví dụ: 400, 300, T850, T565).`
                : 'Ngoài giờ cao điểm hoặc khuya ở Kuala Lumpur, số lượng xe phát GPS sẽ ít hơn.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <h3 className="font-display text-xs font-semibold text-slate-500">
                Xe đang phát tín hiệu GPS trực tiếp
              </h3>
              <span className="font-mono text-xs text-slate-500 tabular-nums">
                {filteredVehicles.length} xe
              </span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {filteredVehicles.slice(0, 80).map((bus) => (
                <button
                  key={bus.id}
                  type="button"
                  onClick={() => onSelectBus(bus)}
                  className="w-full px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="shrink-0 min-w-[52px] text-center px-2 py-1 rounded-md font-mono text-xs font-bold text-white tabular-nums"
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
                      {bus.updatedSecondsAgo}s trước
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {filteredVehicles.length > 80 && (
              <p className="text-center text-xs text-slate-400 pt-1">
                Đang hiện 80/{filteredVehicles.length} xe — hãy gõ mã tuyến (vd: 400, T565) để lọc
                nhanh.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
