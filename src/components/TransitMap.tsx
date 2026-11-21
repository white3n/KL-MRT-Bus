import L from 'leaflet';
import {
  Bell,
  BellRing,
  BookmarkCheck,
  BookmarkPlus,
  Bus,
  Crosshair,
  Layers,
  LocateFixed,
  Navigation,
  TrainFront,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { matchesMyBusStationStrict, type MyBusStation } from '../hooks/useMyStations';
import { translations, useLanguage } from '../i18n';
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
import type { DirectionsTarget } from '../utils/directionsHelper';
import { normalizeSearch } from '../utils/transitHelpers';

const KL_CENTER: [number, number] = [3.1478, 101.6953];
const KL_DEFAULT_ZOOM = 12;

interface TileProvider {
  name: string;
  url: string;
  options: L.TileLayerOptions;
}

// Free, no-API-key tile providers (OpenStreetMap Standard primary + free fallbacks)
const TILE_PROVIDERS: TileProvider[] = [
  {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors · api.data.gov.my',
    },
  },
  {
    name: 'Esri World Street Map',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    options: {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri · OpenStreetMap · api.data.gov.my',
    },
  },
  {
    name: 'OSM Humanitarian',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    options: {
      subdomains: 'abc',
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors, HOT · api.data.gov.my',
    },
  },
];

interface TransitMapProps {
  mode: TransitMode;
  isVisible?: boolean;
  lines: RailLine[];
  stations: RailStation[];
  selectedLineId: string;
  selectedStationId: string | null;
  liveBuses: LiveBusVehicle[];
  busCategoryFilter: 'all' | BusCategory;
  busSearchQuery: string;
  selectedBus: LiveBusVehicle | null;
  selectedBusRouteDetail: BusRouteDetailPayload | null;
  userLocation: UserLocation | null;
  focusedBusStop: NearbyBusStop | null;
  myBusStation: MyBusStation | null;
  focusMyStationSeq: number;
  isLocating: boolean;
  trackingId: string | null;
  onSelectStation: (stopId: string, openDetailOnMobile?: boolean) => void;
  onSelectBus: (bus: LiveBusVehicle, openDetailOnMobile?: boolean) => void;
  onModeChange: (mode: TransitMode) => void;
  onToggleMode: () => void;
  onRequestLocation: () => void;
  onOpenDirections: (target: DirectionsTarget) => void;
  onToggleTrackStation: (stopId: string) => void;
  onToggleTrackBus: (bus: LiveBusVehicle) => void;
  onToggleMyBusStation: (station: MyBusStation) => void;
  onClearBusFilter: () => void;
  onClearMapSelection: () => void;
}

function filterValidCoords(points: [number, number][]): [number, number][] {
  return points.filter(
    (pt) =>
      Array.isArray(pt) &&
      pt.length >= 2 &&
      Number.isFinite(pt[0]) &&
      Number.isFinite(pt[1]) &&
      Math.abs(pt[0]) <= 90 &&
      Math.abs(pt[1]) <= 180
  );
}

function createBusMarkerIcon(bus: LiveBusVehicle, isSelected: boolean): L.DivIcon {
  const stroke = isSelected ? '#0F172A' : '#FFFFFF';
  const strokeWidth = isSelected ? 2.4 : 2;
  const scale = isSelected ? 1.18 : 1;
  const halo = isSelected
    ? 'filter: drop-shadow(0 4px 10px rgba(15,23,42,0.45));'
    : 'filter: drop-shadow(0 2px 5px rgba(15,23,42,0.28));';
  const pillBorder = isSelected ? '#0F172A' : '#FFFFFF';

  // Top-down directional bus SVG facing North (0 deg), rotated smoothly to bus.bearing
  // Clearly shows curved front windshield + glowing headlights + forward beam vs flat rear taillights
  const html = `
    <div style="transform: scale(${scale}); display:flex; flex-direction:column; align-items:center; pointer-events:auto; ${halo}">
      <div style="width:36px; height:36px; display:flex; align-items:center; justify-content:center; transform:rotate(${bus.bearing}deg); will-change:transform;">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Subtle forward headlight cone showing travel direction -->
          <path d="M18 0.5 L25.5 7.5 L10.5 7.5 Z" fill="${bus.color}" fill-opacity="0.34" />
          <!-- Side mirrors near the front nose -->
          <rect x="7.5" y="9.5" width="3" height="2" rx="1" fill="${stroke}" />
          <rect x="25.5" y="9.5" width="3" height="2" rx="1" fill="${stroke}" />
          <!-- Bus body (rounded front nose at top, flatter rear at bottom) -->
          <path d="M11 11 C11 7.2 13.4 6 18 6 C22.6 6 25 7.2 25 11 L25 28.5 C25 30.4 23.6 31.5 21.8 31.5 L14.2 31.5 C12.4 31.5 11 30.4 11 28.5 Z" fill="${bus.color}" stroke="${stroke}" stroke-width="${strokeWidth}" />
          <!-- Panoramic front windshield (clearly marks the front of the bus) -->
          <path d="M13 11.2 C13 9.2 14.8 8.3 18 8.3 C21.2 8.3 23 9.2 23 11.2 L22.4 14 C22.3 14.5 21.8 14.8 21.2 14.8 L14.8 14.8 C14.2 14.8 13.7 14.5 13.6 14 Z" fill="#E0F2FE" />
          <!-- Bright front headlights -->
          <circle cx="13.2" cy="7.6" r="1.4" fill="#FEF08A" />
          <circle cx="22.8" cy="7.6" r="1.4" fill="#FEF08A" />
          <!-- Roof AC detail -->
          <rect x="14.5" y="17.5" width="7" height="7.5" rx="2" fill="#FFFFFF" fill-opacity="0.28" />
          <!-- Rear red taillights -->
          <rect x="12.6" y="29.4" width="3" height="1.5" rx="0.7" fill="#FDA4AF" />
          <rect x="20.4" y="29.4" width="3" height="1.5" rx="0.7" fill="#FDA4AF" />
        </svg>
      </div>
      <div style="
        margin-top:-4px;
        background:${bus.color};
        color:#FFFFFF;
        border:1.8px solid ${pillBorder};
        border-radius:9999px;
        padding:0px 6px;
        font-family:'JetBrains Mono',monospace;
        font-size:10px;
        font-weight:800;
        line-height:15px;
        white-space:nowrap;
        box-shadow:0 2px 5px rgba(15,23,42,0.28);
      ">${bus.routeShortName}</div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'kl-bus-div-icon',
    iconSize: [44, 48],
    iconAnchor: [22, 18],
  });
}

export function TransitMap({
  mode,
  isVisible = true,
  lines,
  stations,
  selectedLineId,
  selectedStationId,
  liveBuses,
  busCategoryFilter,
  busSearchQuery,
  selectedBus,
  selectedBusRouteDetail,
  userLocation,
  focusedBusStop,
  myBusStation,
  focusMyStationSeq,
  isLocating,
  trackingId,
  onSelectStation,
  onSelectBus,
  onModeChange,
  onToggleMode,
  onRequestLocation,
  onOpenDirections,
  onToggleTrackStation,
  onToggleTrackBus,
  onToggleMyBusStation,
  onClearBusFilter,
  onClearMapSelection,
}: TransitMapProps) {
  const { lang } = useLanguage();
  const t = translations[lang];

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const railLinesLayerRef = useRef<L.LayerGroup | null>(null);
  const stationsLayerRef = useRef<L.LayerGroup | null>(null);
  const busRouteLayerRef = useRef<L.LayerGroup | null>(null);
  const busesLayerRef = useRef<L.LayerGroup | null>(null);
  const userLocationLayerRef = useRef<L.LayerGroup | null>(null);
  const pendingFocusRef = useRef<{ lat: number; lon: number; zoom: number } | null>(null);
  const hasRenderedVisibleRef = useRef(false);

  const safeFocus = (map: L.Map, lat: number, lon: number, targetZoom: number, animate = true) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const safeZoom = Number.isFinite(targetZoom) ? targetZoom : KL_DEFAULT_ZOOM;
    const container = map.getContainer();
    const rect = container.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0;

    if (!visible) {
      pendingFocusRef.current = { lat, lon, zoom: safeZoom };
      return;
    }

    map.invalidateSize({ animate: false, pan: false });
    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0) {
      pendingFocusRef.current = { lat, lon, zoom: safeZoom };
      return;
    }

    pendingFocusRef.current = null;
    try {
      if (animate) {
        map.flyTo([lat, lon], safeZoom, { duration: 0.6 });
      } else {
        map.setView([lat, lon], safeZoom, { animate: false });
      }
    } catch {
      map.setView([lat, lon], safeZoom, { animate: false });
    }
  };

  // Initialize Leaflet map once with standard OpenStreetMap + automatic free fallback
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: KL_CENTER,
      zoom: KL_DEFAULT_ZOOM,
      zoomControl: false,
      preferCanvas: false,
      fadeAnimation: true,
    });

    let providerIndex = 0;
    let consecutiveTileErrors = 0;

    const attachTileLayer = (idx: number) => {
      if (tileLayerRef.current) {
        map.removeLayer(tileLayerRef.current);
      }
      const provider = TILE_PROVIDERS[idx];
      const layer = L.tileLayer(provider.url, provider.options);
      layer.on('tileload', () => {
        consecutiveTileErrors = 0;
      });
      layer.on('tileerror', () => {
        consecutiveTileErrors += 1;
        if (consecutiveTileErrors >= 4 && providerIndex < TILE_PROVIDERS.length - 1) {
          consecutiveTileErrors = 0;
          providerIndex += 1;
          attachTileLayer(providerIndex);
        }
      });
      layer.addTo(map);
      tileLayerRef.current = layer;
    };

    attachTileLayer(0);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    railLinesLayerRef.current = L.layerGroup().addTo(map);
    busRouteLayerRef.current = L.layerGroup().addTo(map);
    stationsLayerRef.current = L.layerGroup().addTo(map);
    busesLayerRef.current = L.layerGroup().addTo(map);
    userLocationLayerRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    const syncMapSize = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      map.invalidateSize({ animate: false, pan: false });

      if (pendingFocusRef.current) {
        const { lat, lon, zoom } = pendingFocusRef.current;
        pendingFocusRef.current = null;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          map.setView([lat, lon], zoom, { animate: false });
        }
      } else if (!hasRenderedVisibleRef.current) {
        map.setView(KL_CENTER, KL_DEFAULT_ZOOM, { animate: false });
      }

      hasRenderedVisibleRef.current = true;
      tileLayerRef.current?.redraw();
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      syncMapSize();
    });
    resizeObserver.observe(containerRef.current);

    const initTimer = window.setTimeout(syncMapSize, 120);

    return () => {
      window.clearTimeout(initTimer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      hasRenderedVisibleRef.current = false;
    };
  }, []);

  // Explicitly resync Leaflet when switching to map tab on mobile / Android WebView
  useEffect(() => {
    if (!isVisible) return;
    const map = mapRef.current;
    if (!map) return;

    const refresh = () => {
      const rect = map.getContainer().getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      map.invalidateSize({ animate: false, pan: false });
      if (pendingFocusRef.current) {
        const { lat, lon, zoom } = pendingFocusRef.current;
        pendingFocusRef.current = null;
        map.setView([lat, lon], zoom, { animate: false });
      } else if (!hasRenderedVisibleRef.current) {
        map.setView(KL_CENTER, KL_DEFAULT_ZOOM, { animate: false });
      }
      hasRenderedVisibleRef.current = true;
      tileLayerRef.current?.redraw();
    };

    const rafId = window.requestAnimationFrame(refresh);
    const t1 = window.setTimeout(refresh, 120);
    const t2 = window.setTimeout(refresh, 350);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isVisible]);

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

    for (const line of lines) {
      const validPoints = filterValidCoords(line.shapePoints);
      if (validPoints.length < 2) continue;
      const isFocused = focusLineId === 'all' || focusLineId === line.routeId;
      L.polyline(validPoints, {
        color: line.color,
        weight: isFocused ? 4.5 : 2.5,
        opacity: isFocused ? 0.92 : 0.25,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(railLayer);
    }

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
        `<div style="font-family:var(--app-font-family);font-size:12px;font-weight:700;color:#0F172A;">
          <span style="font-family:'JetBrains Mono',monospace;color:${st.routeColor};margin-right:4px;">${st.stopId}</span>${st.displayName}
        </div>
        <div style="font-size:11px;color:#64748B;">${st.category} ${st.routeLongName}</div>`,
        { direction: 'top', offset: [0, -8] }
      );

      marker.on('click', () => {
        onSelectStation(st.stopId, false);
      });

      marker.addTo(stationLayer);
    }
  }, [mode, lines, stations, selectedLineId, selectedStationId, onSelectStation]);

  // Pan smoothly to selected station
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

    const validShape = filterValidCoords(selectedBusRouteDetail.shapePoints);
    if (validShape.length > 1) {
      L.polyline(validShape, {
        color: selectedBusRouteDetail.route.color,
        weight: 4,
        opacity: 0.85,
        dashArray: '8 6',
      }).addTo(layer);
    }

    for (const stop of selectedBusRouteDetail.stops) {
      if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) continue;
      const isMy = matchesMyBusStationStrict(stop, myBusStation);
      L.circleMarker([stop.lat, stop.lon], {
        radius: isMy ? 7 : 3.5,
        color: isMy ? '#059669' : selectedBusRouteDetail.route.color,
        weight: isMy ? 3 : 1.5,
        fillColor: isMy ? '#ECFDF5' : '#FFFFFF',
        fillOpacity: 1,
      })
        .bindTooltip(
          `<div style="font-size:11px;font-weight:700;color:${isMy ? '#047857' : '#0F172A'};">${
            isMy ? '★ ' : ''
          }${stop.stopName}</div>`,
          { direction: 'top', offset: [0, -4] }
        )
        .addTo(layer);
    }
  }, [selectedBusRouteDetail, myBusStation]);

  // Compute the exact live buses to display on the map (respects inspected bus route OR bus search filter!)
  const { visibleMapBuses, activeBusFilterLabel } = useMemo(() => {
    const showBus = mode === 'bus' || mode === 'all' || !!selectedBus;
    if (!showBus) {
      return { visibleMapBuses: [] as LiveBusVehicle[], activeBusFilterLabel: null as string | null };
    }

    const q = normalizeSearch(busSearchQuery);

    if (selectedBus) {
      const sameRoute = liveBuses.filter(
        (b) =>
          b.id === selectedBus.id ||
          (b.routeShortName.toUpperCase() === selectedBus.routeShortName.toUpperCase() &&
            b.category === selectedBus.category)
      );
      return {
        visibleMapBuses: sameRoute,
        activeBusFilterLabel: selectedBus.routeShortName,
      };
    }

    if (q) {
      const matched = liveBuses.filter((b) => {
        if (busCategoryFilter !== 'all' && b.category !== busCategoryFilter) return false;
        return (
          normalizeSearch(b.routeShortName).includes(q) ||
          normalizeSearch(b.routeLongName).includes(q) ||
          normalizeSearch(b.headsign).includes(q) ||
          normalizeSearch(b.licensePlate).includes(q)
        );
      });
      return {
        visibleMapBuses: matched,
        activeBusFilterLabel: busSearchQuery.trim(),
      };
    }

    const byCategory = liveBuses.filter(
      (b) => busCategoryFilter === 'all' || b.category === busCategoryFilter
    );
    return {
      visibleMapBuses: byCategory,
      activeBusFilterLabel: null,
    };
  }, [mode, liveBuses, busCategoryFilter, busSearchQuery, selectedBus]);

  // Render live GPS bus markers
  useEffect(() => {
    const layer = busesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const bus of visibleMapBuses) {
      if (!Number.isFinite(bus.lat) || !Number.isFinite(bus.lon)) continue;
      const isSelected = selectedBus?.id === bus.id;
      const marker = L.marker([bus.lat, bus.lon], {
        icon: createBusMarkerIcon(bus, isSelected),
        zIndexOffset: isSelected ? 1000 : 100,
      });

      marker.bindTooltip(
        `<div style="font-family:var(--app-font-family);font-size:12px;font-weight:700;color:#0F172A;">
          Bus ${bus.routeShortName} · ${bus.licensePlate}
        </div>
        <div style="font-size:11px;color:#475569;">${bus.headsign || bus.routeLongName}</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#0284C7;margin-top:2px;">
          ${bus.speedKmh} km/h · ${t.gpsAgo(bus.updatedSecondsAgo)}
        </div>`,
        { direction: 'top', offset: [0, -10] }
      );

      marker.on('click', () => {
        onSelectBus(bus, false);
      });

      marker.addTo(layer);
    }
  }, [visibleMapBuses, selectedBus, onSelectBus, t]);

  // Auto-focus map onto filtered search buses when switching to map with an active bus search
  const lastFocusedSearchRef = useRef<string>('');
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isVisible || selectedBus) return;
    const key = busSearchQuery.trim().toLowerCase();
    if (!key) {
      lastFocusedSearchRef.current = '';
      return;
    }
    if (key !== lastFocusedSearchRef.current && visibleMapBuses.length > 0) {
      lastFocusedSearchRef.current = key;
      const pts = filterValidCoords(visibleMapBuses.map((b) => [b.lat, b.lon]));
      if (pts.length === 1) {
        safeFocus(map, pts[0][0], pts[0][1], 14, true);
      } else if (pts.length > 1) {
        try {
          map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 14 });
        } catch {
          safeFocus(map, pts[0][0], pts[0][1], 13, true);
        }
      }
    }
  }, [isVisible, busSearchQuery, visibleMapBuses, selectedBus]);

  // Pan to selected bus when selection changes
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
          `<div style="font-family:var(--app-font-family);font-size:12px;font-weight:700;color:#0F172A;">${t.yourGpsLocation}</div>`,
          { direction: 'top', offset: [0, -8] }
        )
        .addTo(layer);

      if (prevUserLocTs.current !== userLocation.timestamp) {
        prevUserLocTs.current = userLocation.timestamp;
        safeFocus(map, userLocation.lat, userLocation.lon, 15, true);
      }
    }

    if (
      focusedBusStop &&
      Number.isFinite(focusedBusStop.lat) &&
      Number.isFinite(focusedBusStop.lon)
    ) {
      const distStr =
        focusedBusStop.distanceMeters < 1000
          ? `${focusedBusStop.distanceMeters}m`
          : `${(focusedBusStop.distanceMeters / 1000).toFixed(1)}km`;

      L.circleMarker([focusedBusStop.lat, focusedBusStop.lon], {
        radius: 8,
        color: '#0F172A',
        weight: 2.5,
        fillColor: '#0284C7',
        fillOpacity: 1,
      })
        .bindTooltip(
          `<div style="font-family:var(--app-font-family);font-size:12px;font-weight:700;color:#0F172A;">${focusedBusStop.stopName}</div>
          <div style="font-size:11px;color:#475569;">${t.busStopTooltipDist(distStr)}</div>`,
          { direction: 'top', offset: [0, -8] }
        )
        .addTo(layer);
    }
    if (myBusStation && Number.isFinite(myBusStation.lat) && Number.isFinite(myBusStation.lon)) {
      const myIcon = L.divIcon({
        html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:#059669;border:2.5px solid #FFFFFF;color:#FFFFFF;font-size:13px;font-weight:800;box-shadow:0 4px 12px rgba(5,150,105,0.45);">★</div>`,
        className: 'kl-my-station-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([myBusStation.lat, myBusStation.lon], {
        icon: myIcon,
        zIndexOffset: 900,
      })
        .bindTooltip(
          `<div style="font-family:var(--app-font-family);font-size:12px;font-weight:700;color:#047857;">★ ${t.myBusStationLabel}</div>
          <div style="font-size:11px;color:#0F172A;font-weight:600;">${myBusStation.stopName}</div>`,
          { direction: 'top', offset: [0, -12] }
        )
        .addTo(layer);
    }
  }, [userLocation, focusedBusStop, myBusStation, t]);

  // Pan to My Bus Station when requested explicitly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !myBusStation || focusMyStationSeq <= 0) return;
    safeFocus(map, myBusStation.lat, myBusStation.lon, 16, true);
  }, [focusMyStationSeq, myBusStation]);

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

  const selectedStationObj = selectedStationId
    ? stations.find((s) => s.stopId === selectedStationId) || null
    : null;

  return (
    <div className="relative w-full h-full bg-slate-100">
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Mobile Floating Material 3 Map Layer Switcher (top-left) */}
      <div className="md:hidden absolute top-3.5 left-3.5 z-[400] inline-flex items-center gap-1 p-1 rounded-2xl bg-white/95 backdrop-blur-xs border border-slate-200/90 shadow-md">
        {(
          [
            { id: 'rail' as const, label: t.modeRail, icon: TrainFront },
            { id: 'bus' as const, label: t.modeBus, icon: Bus },
            { id: 'all' as const, label: t.modeAll, icon: Layers },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onModeChange(item.id)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all active:scale-95 cursor-pointer ${
                active ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Bus Filter Banner on Map (shows which inspected bus route's live fleet is displayed) */}
      {activeBusFilterLabel && (
        <div className="absolute top-16 md:top-3.5 left-3.5 z-[400] inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-slate-900/95 text-white shadow-lg text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span>{t.mapBusFilterChip(activeBusFilterLabel, visibleMapBuses.length)}</span>
          <button
            type="button"
            onClick={onClearBusFilter}
            aria-label={t.clearFilters}
            className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Material 3 Floating Map Controls (top-right) */}
      <div className="absolute top-3.5 right-3.5 z-[400] flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onRequestLocation}
          disabled={isLocating}
          aria-label={t.mapGpsTitle}
          title={t.mapGpsTitle}
          className="inline-flex items-center justify-center gap-2 h-11 min-w-11 px-3 sm:px-3.5 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-70 text-white rounded-2xl shadow-md shadow-blue-600/25 text-xs font-semibold transition-all cursor-pointer"
        >
          <LocateFixed className={`w-4.5 h-4.5 ${isLocating ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">
            {isLocating ? t.locatingShort : t.mapGpsLabel}
          </span>
        </button>

        <button
          type="button"
          onClick={handleRecenter}
          aria-label={t.mapRecenterTitle}
          title={t.mapRecenterTitle}
          className="inline-flex items-center justify-center gap-2 h-11 min-w-11 px-3 sm:px-3.5 bg-white/95 hover:bg-white active:scale-95 text-slate-800 border border-slate-200/90 rounded-2xl shadow-md text-xs font-semibold transition-all cursor-pointer"
        >
          <Crosshair className="w-4.5 h-4.5 text-slate-700" />
          <span className="hidden sm:inline">{t.mapRecenterLabel}</span>
        </button>

        <button
          type="button"
          onClick={onToggleMode}
          aria-label={t.mapLayerTitle}
          title={t.mapLayerTitle}
          className="hidden md:inline-flex items-center justify-center gap-2 h-11 min-w-11 px-3 sm:px-3.5 bg-white/95 hover:bg-white active:scale-95 text-slate-800 border border-slate-200/90 rounded-2xl shadow-md text-xs font-semibold transition-all cursor-pointer"
        >
          <Layers className="w-4.5 h-4.5 text-slate-700" />
          <span className="hidden sm:inline">
            {mode === 'rail'
              ? t.mapLayerShowBus
              : mode === 'bus'
                ? t.mapLayerShowRail
                : t.mapLayerAll}
          </span>
        </button>
      </div>

      {/* Mobile Interactive Map Preview Card (Citymapper / Google Maps style) */}
      {(selectedStationObj || selectedBus || focusedBusStop) && (
        <div className="md:hidden absolute bottom-3 left-3 right-16 z-[450] bg-white/98 backdrop-blur-sm border border-slate-200/90 rounded-3xl shadow-xl p-3.5 space-y-2.5">
          {selectedStationObj ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className="px-2 py-0.5 rounded-lg font-mono text-xs font-bold text-white shrink-0 mt-0.5"
                    style={{ backgroundColor: selectedStationObj.routeColor }}
                  >
                    {selectedStationObj.stopId}
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-sm font-bold text-slate-950 truncate">
                      {selectedStationObj.displayName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {selectedStationObj.category} {selectedStationObj.routeLongName}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClearMapSelection}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onOpenDirections({
                      name: selectedStationObj.displayName,
                      subtitle: `${selectedStationObj.category} ${selectedStationObj.routeLongName}`,
                      badge: selectedStationObj.stopId,
                      color: selectedStationObj.routeColor,
                      lat: selectedStationObj.lat,
                      lon: selectedStationObj.lon,
                      kind: 'rail',
                    })
                  }
                  className="flex-1 py-2 px-3 rounded-full bg-blue-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{t.directionsBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTrackStation(selectedStationObj.stopId)}
                  className={`py-2 px-3 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer ${
                    trackingId === `rail:${selectedStationObj.stopId}`
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {trackingId === `rail:${selectedStationObj.stopId}` ? (
                    <BellRing className="w-3.5 h-3.5" />
                  ) : (
                    <Bell className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectStation(selectedStationObj.stopId, true)}
                  className="py-2 px-3 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                >
                  {t.mapPreviewSchedule}
                </button>
              </div>
            </>
          ) : selectedBus ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className="px-2 py-0.5 rounded-lg font-mono text-xs font-bold text-white shrink-0 mt-0.5"
                    style={{ backgroundColor: selectedBus.color }}
                  >
                    {selectedBus.routeShortName}
                  </span>
                  <div className="min-w-0">
                    <div className="font-display text-sm font-bold text-slate-950 truncate">
                      {selectedBus.headsign || selectedBus.routeLongName}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">
                      {selectedBus.speedKmh} km/h · {selectedBus.licensePlate} ·{' '}
                      {t.agoShort(selectedBus.updatedSecondsAgo)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClearMapSelection}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onOpenDirections({
                      name: `Bus ${selectedBus.routeShortName}`,
                      subtitle: selectedBus.headsign || selectedBus.routeLongName,
                      badge: selectedBus.routeShortName,
                      color: selectedBus.color,
                      lat: selectedBus.lat,
                      lon: selectedBus.lon,
                      kind: 'bus-live',
                    })
                  }
                  className="flex-1 py-2 px-3 rounded-full bg-blue-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{t.directionsBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleTrackBus(selectedBus)}
                  className={`py-2 px-3 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer ${
                    trackingId === `bus:${selectedBus.id}`
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {trackingId === `bus:${selectedBus.id}` ? (
                    <BellRing className="w-3.5 h-3.5" />
                  ) : (
                    <Bell className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSelectBus(selectedBus, true)}
                  className="py-2 px-3 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                >
                  {t.mapPreviewDetails}
                </button>
              </div>
            </>
          ) : focusedBusStop ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display text-sm font-bold text-slate-950 truncate">
                    {focusedBusStop.stopName}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {focusedBusStop.stopCode ? `${focusedBusStop.stopCode} · ` : ''}
                    {focusedBusStop.category === 'rapid-bus-mrtfeeder'
                      ? 'MRT Feeder Bus Stop'
                      : 'Rapid Bus KL Stop'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClearMapSelection}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 shrink-0 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onOpenDirections({
                      name: focusedBusStop.stopName,
                      subtitle:
                        focusedBusStop.category === 'rapid-bus-mrtfeeder'
                          ? 'MRT Feeder Bus Stop'
                          : 'Rapid Bus KL Stop',
                      badge: focusedBusStop.stopCode || 'BUS',
                      color: '#0284C7',
                      lat: focusedBusStop.lat,
                      lon: focusedBusStop.lon,
                      kind: 'bus-stop',
                    })
                  }
                  className="flex-1 py-2 px-3 rounded-full bg-blue-600 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{t.directionsBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onToggleMyBusStation({
                      stopId: focusedBusStop.stopId,
                      stopCode: focusedBusStop.stopCode,
                      stopName: focusedBusStop.stopName,
                      lat: focusedBusStop.lat,
                      lon: focusedBusStop.lon,
                      category: focusedBusStop.category,
                    })
                  }
                  className={`py-2 px-3 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer ${
                    matchesMyBusStationStrict(focusedBusStop, myBusStation)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-800'
                  }`}
                >
                  {matchesMyBusStationStrict(focusedBusStop, myBusStation) ? (
                    <BookmarkCheck className="w-3.5 h-3.5" />
                  ) : (
                    <BookmarkPlus className="w-3.5 h-3.5" />
                  )}
                  <span>{t.myStationBadge}</span>
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Compact Rapid KL Line Legend (bottom-left on desktop) */}
      {(mode === 'rail' || mode === 'all') && lines.length > 0 && (
        <div className="hidden lg:flex absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-xs border border-slate-200/90 rounded-2xl px-3.5 py-2 shadow-md items-center gap-3 text-[11px] text-slate-600">
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
