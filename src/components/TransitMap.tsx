import L from 'leaflet';
import { Crosshair, Layers, LocateFixed } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type {
  BusCategory,
  BusRouteDetailPayload,
  LiveBusVehicle,
  NearbyBusStop,
  RailLine,
  RailStation,
  TransitMode,
  UserLocation,
} from '../types/transit';

const KL_CENTER: [number, number] = [3.1478, 101.6953];
const KL_DEFAULT_ZOOM = 12;

interface TransitMapProps {
  mode: TransitMode;
  lines: RailLine[];
  stations: RailStation[];
  selectedLineId: string;
  selectedStationId: string | null;
  liveBuses: LiveBusVehicle[];
  busCategoryFilter: 'all' | BusCategory;
  selectedBus: LiveBusVehicle | null;
  selectedBusRouteDetail: BusRouteDetailPayload | null;
  userLocation: UserLocation | null;
  focusedBusStop: NearbyBusStop | null;
  isLocating: boolean;
  onSelectStation: (stopId: string) => void;
  onSelectBus: (bus: LiveBusVehicle) => void;
  onToggleMode: () => void;
  onRequestLocation: () => void;
}

function createBusMarkerIcon(bus: LiveBusVehicle, isSelected: boolean): L.DivIcon {
  const border = isSelected ? '#0F172A' : '#FFFFFF';
  const scale = isSelected ? 1.18 : 1;
  const shadow = isSelected
    ? '0 6px 16px rgba(15,23,42,0.35)'
    : '0 2px 6px rgba(15,23,42,0.22)';

  const html = `
    <div style="transform: scale(${scale}); display:flex; flex-direction:column; align-items:center; pointer-events:auto;">
      <div style="
        background:${bus.color};
        color:#FFFFFF;
        border:2px solid ${border};
        border-radius:6px;
        padding:1px 6px;
        font-family:'JetBrains Mono',monospace;
        font-size:10px;
        font-weight:700;
        line-height:14px;
        white-space:nowrap;
        box-shadow:${shadow};
        display:flex;
        align-items:center;
        gap:3px;
      ">
        <span>${bus.routeShortName}</span>
        <span style="display:inline-block; transform:rotate(${bus.bearing}deg); font-size:9px; line-height:1;">▲</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'kl-bus-div-icon',
    iconSize: [52, 20],
    iconAnchor: [26, 10],
  });
}

export function TransitMap({
  mode,
  lines,
  stations,
  selectedLineId,
  selectedStationId,
  liveBuses,
  busCategoryFilter,
  selectedBus,
  selectedBusRouteDetail,
  userLocation,
  focusedBusStop,
  isLocating,
  onSelectStation,
  onSelectBus,
  onToggleMode,
  onRequestLocation,
}: TransitMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const railLinesLayerRef = useRef<L.LayerGroup | null>(null);
  const stationsLayerRef = useRef<L.LayerGroup | null>(null);
  const busRouteLayerRef = useRef<L.LayerGroup | null>(null);
  const busesLayerRef = useRef<L.LayerGroup | null>(null);
  const userLocationLayerRef = useRef<L.LayerGroup | null>(null);
  const pendingFocusRef = useRef<{ lat: number; lon: number; zoom: number } | null>(null);

  const safeFocus = (map: L.Map, lat: number, lon: number, targetZoom: number, animate = true) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const safeZoom = Number.isFinite(targetZoom) ? targetZoom : KL_DEFAULT_ZOOM;
    const container = map.getContainer();
    const isVisible =
      container.offsetWidth > 0 && container.offsetHeight > 0;

    if (!isVisible) {
      pendingFocusRef.current = { lat, lon, zoom: safeZoom };
      return;
    }

    map.invalidateSize({ animate: false });
    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0) {
      pendingFocusRef.current = { lat, lon, zoom: safeZoom };
      return;
    }

    pendingFocusRef.current = null;
    if (animate) {
      map.flyTo([lat, lon], safeZoom, { duration: 0.65 });
    } else {
      map.setView([lat, lon], safeZoom, { animate: false });
    }
  };

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: KL_CENTER,
      zoom: KL_DEFAULT_ZOOM,
      zoomControl: false,
      preferCanvas: true,
    });

    // Standard free OpenStreetMap tiles (zero API key required)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors · Dữ liệu: api.data.gov.my',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    railLinesLayerRef.current = L.layerGroup().addTo(map);
    busRouteLayerRef.current = L.layerGroup().addTo(map);
    stationsLayerRef.current = L.layerGroup().addTo(map);
    busesLayerRef.current = L.layerGroup().addTo(map);
    userLocationLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      map.invalidateSize({ animate: false });
      if (pendingFocusRef.current) {
        const { lat, lon, zoom } = pendingFocusRef.current;
        pendingFocusRef.current = null;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          map.setView([lat, lon], zoom, { animate: false });
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw Rapid KL rail polylines & station markers
  useEffect(() => {
    const railLayer = railLinesLayerRef.current;
    const stationLayer = stationsLayerRef.current;
    if (!railLayer || !stationLayer) return;

    railLayer.clearLayers();
    stationLayer.clearLayers();

    const showRail = mode === 'rail' || mode === 'all';
    if (!showRail) return;

    const activeStation = stations.find((s) => s.stopId === selectedStationId);
    const focusLineId =
      selectedLineId !== 'all'
        ? selectedLineId
        : activeStation
          ? activeStation.routeId
          : 'all';

    // Polylines
    for (const line of lines) {
      if (line.shapePoints.length < 2) continue;
      const isFocused = focusLineId === 'all' || focusLineId === line.routeId;
      L.polyline(line.shapePoints, {
        color: line.color,
        weight: isFocused ? 4.5 : 2.5,
        opacity: isFocused ? 0.92 : 0.25,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(railLayer);
    }

    // Station Markers
    for (const st of stations) {
      if (!Number.isFinite(st.lat) || !Number.isFinite(st.lon)) continue;
      const isSelected = st.stopId === selectedStationId;
      const isFocused = focusLineId === 'all' || focusLineId === st.routeId;
      if (!isFocused && !isSelected) continue;

      const isInterchange = st.interchanges.length > 0;
      const marker = L.circleMarker([st.lat, st.lon], {
        radius: isSelected ? 8.5 : isInterchange ? 6 : 4.5,
        color: isSelected ? '#0F172A' : st.routeColor,
        weight: isSelected ? 3 : 2,
        fillColor: isSelected ? st.routeColor : '#FFFFFF',
        fillOpacity: 1,
      });

      marker.bindTooltip(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;color:#0F172A;">
          <span style="font-family:'JetBrains Mono',monospace;color:${st.routeColor};margin-right:4px;">${st.stopId}</span>${st.displayName}
        </div>
        <div style="font-size:11px;color:#64748B;">${st.category} ${st.routeLongName}</div>`,
        { direction: 'top', offset: [0, -8] }
      );

      marker.on('click', () => {
        onSelectStation(st.stopId);
      });

      marker.addTo(stationLayer);
    }
  }, [mode, lines, stations, selectedLineId, selectedStationId, onSelectStation]);

  // Pan smoothly to selected station (safely deferred if map is hidden on mobile)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedStationId) return;
    const st = stations.find((s) => s.stopId === selectedStationId);
    if (!st || !Number.isFinite(st.lat) || !Number.isFinite(st.lon)) return;
    const currentZoom = Number.isFinite(map.getZoom()) ? map.getZoom() : KL_DEFAULT_ZOOM;
    safeFocus(map, st.lat, st.lon, Math.max(currentZoom, 14), true);
  }, [selectedStationId, stations]);

  // Draw selected bus route polyline & stops
  useEffect(() => {
    const layer = busRouteLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!selectedBusRouteDetail) return;

    if (selectedBusRouteDetail.shapePoints.length > 1) {
      L.polyline(selectedBusRouteDetail.shapePoints, {
        color: selectedBusRouteDetail.route.color,
        weight: 4,
        opacity: 0.85,
        dashArray: '8 6',
      }).addTo(layer);
    }

    for (const stop of selectedBusRouteDetail.stops) {
      L.circleMarker([stop.lat, stop.lon], {
        radius: 3.5,
        color: selectedBusRouteDetail.route.color,
        weight: 1.5,
        fillColor: '#FFFFFF',
        fillOpacity: 1,
      })
        .bindTooltip(
          `<div style="font-size:11px;font-weight:600;color:#0F172A;">${stop.stopName}</div>`,
          { direction: 'top', offset: [0, -4] }
        )
        .addTo(layer);
    }
  }, [selectedBusRouteDetail]);

  // Render live GPS bus markers
  useEffect(() => {
    const layer = busesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const showBus = mode === 'bus' || mode === 'all';
    if (!showBus) return;

    const visibleBuses = liveBuses.filter((b) => {
      if (selectedBus && b.id === selectedBus.id) return true;
      if (busCategoryFilter !== 'all' && b.category !== busCategoryFilter) return false;
      return true;
    });

    for (const bus of visibleBuses) {
      if (!Number.isFinite(bus.lat) || !Number.isFinite(bus.lon)) continue;
      const isSelected = selectedBus?.id === bus.id;
      const marker = L.marker([bus.lat, bus.lon], {
        icon: createBusMarkerIcon(bus, isSelected),
        zIndexOffset: isSelected ? 1000 : 100,
      });

      marker.bindTooltip(
        `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;color:#0F172A;">
          Bus ${bus.routeShortName} · ${bus.licensePlate}
        </div>
        <div style="font-size:11px;color:#475569;">${bus.headsign || bus.routeLongName}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#0284C7;margin-top:2px;">
          ${bus.speedKmh} km/h · GPS ${bus.updatedSecondsAgo}s trước
        </div>`,
        { direction: 'top', offset: [0, -10] }
      );

      marker.on('click', () => {
        onSelectBus(bus);
      });

      marker.addTo(layer);
    }
  }, [mode, liveBuses, busCategoryFilter, selectedBus, onSelectBus]);

  // Pan to selected bus when selection changes (safely deferred if hidden on mobile)
  const prevSelectedBusId = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedBus) {
      prevSelectedBusId.current = null;
      return;
    }
    if (prevSelectedBusId.current !== selectedBus.id) {
      prevSelectedBusId.current = selectedBus.id;
      const currentZoom = Number.isFinite(map.getZoom()) ? map.getZoom() : KL_DEFAULT_ZOOM;
      safeFocus(map, selectedBus.lat, selectedBus.lon, Math.max(currentZoom, 14), true);
    }
  }, [selectedBus]);

  // Render user GPS location marker + accuracy circle + focused nearby bus stop
  const prevUserLocTs = useRef<number>(0);
  useEffect(() => {
    const layer = userLocationLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    if (userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lon)) {
      if (userLocation.accuracyMeters > 0 && userLocation.accuracyMeters < 5000) {
        L.circle([userLocation.lat, userLocation.lon], {
          radius: userLocation.accuracyMeters,
          color: '#2563EB',
          weight: 1,
          fillColor: '#3B82F6',
          fillOpacity: 0.14,
        }).addTo(layer);
      }

      L.circleMarker([userLocation.lat, userLocation.lon], {
        radius: 7,
        color: '#FFFFFF',
        weight: 3,
        fillColor: '#2563EB',
        fillOpacity: 1,
      })
        .bindTooltip(
          `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;color:#0F172A;">Vị trí GPS của bạn</div>`,
          { direction: 'top', offset: [0, -8] }
        )
        .addTo(layer);

      if (prevUserLocTs.current !== userLocation.timestamp) {
        prevUserLocTs.current = userLocation.timestamp;
        safeFocus(map, userLocation.lat, userLocation.lon, 15, true);
      }
    }

    if (focusedBusStop && Number.isFinite(focusedBusStop.lat) && Number.isFinite(focusedBusStop.lon)) {
      L.circleMarker([focusedBusStop.lat, focusedBusStop.lon], {
        radius: 8,
        color: '#0F172A',
        weight: 2.5,
        fillColor: '#0284C7',
        fillOpacity: 1,
      })
        .bindTooltip(
          `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:700;color:#0F172A;">${focusedBusStop.stopName}</div>
          <div style="font-size:11px;color:#475569;">Trạm xe Bus · Cách ${
            focusedBusStop.distanceMeters < 1000
              ? `${focusedBusStop.distanceMeters}m`
              : `${(focusedBusStop.distanceMeters / 1000).toFixed(1)}km`
          }</div>`,
          { direction: 'top', offset: [0, -8] }
        )
        .addTo(layer);
    }
  }, [userLocation, focusedBusStop]);

  // Pan to focused nearby bus stop when selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedBusStop) return;
    safeFocus(map, focusedBusStop.lat, focusedBusStop.lon, 16, true);
  }, [focusedBusStop]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    safeFocus(map, KL_CENTER[0], KL_CENTER[1], KL_DEFAULT_ZOOM, true);
  };

  return (
    <div className="relative w-full h-full bg-slate-100">
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Clean floating map controls (top-right) */}
      <div className="absolute top-3.5 right-3.5 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={onRequestLocation}
          disabled={isLocating}
          title="Tìm ga MRT/LRT và trạm xe Bus gần vị trí GPS của bạn"
          className="inline-flex items-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-70 text-white rounded-lg shadow-sm text-xs font-semibold transition-colors cursor-pointer"
        >
          <LocateFixed className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{isLocating ? 'Đang định vị…' : 'Gần tôi (GPS)'}</span>
        </button>

        <button
          type="button"
          onClick={handleRecenter}
          title="Về trung tâm Kuala Lumpur"
          className="inline-flex items-center gap-2 px-3 py-2 bg-white/95 hover:bg-white text-slate-800 border border-slate-200 rounded-lg shadow-sm text-xs font-medium transition-colors cursor-pointer"
        >
          <Crosshair className="w-3.5 h-3.5 text-slate-600" />
          <span className="hidden sm:inline">Trung tâm KL</span>
        </button>

        <button
          type="button"
          onClick={onToggleMode}
          title="Chuyển nhanh lớp hiển thị bản đồ"
          className="inline-flex items-center gap-2 px-3 py-2 bg-white/95 hover:bg-white text-slate-800 border border-slate-200 rounded-lg shadow-sm text-xs font-medium transition-colors cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5 text-slate-600" />
          <span className="hidden sm:inline">
            {mode === 'rail'
              ? 'Hiện thêm Bus'
              : mode === 'bus'
                ? 'Hiện thêm Tàu'
                : 'Đang hiện tất cả'}
          </span>
        </button>
      </div>

      {/* Compact Rapid KL Line Legend (bottom-left on desktop) */}
      {(mode === 'rail' || mode === 'all') && lines.length > 0 && (
        <div className="hidden lg:flex absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-xs border border-slate-200 rounded-lg px-3 py-2 shadow-sm items-center gap-3 text-[11px] text-slate-600">
          {lines.slice(0, 7).map((line) => (
            <div key={line.routeId} className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="w-2.5 h-1 rounded-full shrink-0"
                style={{ backgroundColor: line.color }}
              />
              <span className="font-mono font-semibold text-slate-800">{line.shortName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
