import L from 'leaflet';
import {
  Bell,
  BellRing,
  BookmarkCheck,
  BookmarkPlus,
  Bus,
  Crosshair,
  Globe2,
  Layers,
  LocateFixed,
  Moon,
  Navigation,
  Sun,
  TrainFront,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { getTransitPalette } from '../utils/transitTheme';
import { normalizeSearch } from '../utils/transitHelpers';

const KL_CENTER: [number, number] = [3.1478, 101.6953];
const KL_DEFAULT_ZOOM = 12;

type MapStyleId = 'dark' | 'street' | 'satellite';
const MAP_STYLE_KEY = 'kl_transit_map_style_v1';

interface BasemapConfig {
  id: MapStyleId;
  label: string;
  baseUrl: string;
  baseOptions: L.TileLayerOptions;
  overlayUrl?: string;
  overlayOptions?: L.TileLayerOptions;
}

// Sleek, keyless, watermark-free basemaps (Transit Dark primary + Esri Street + Satellite)
const BASEMAP_CONFIGS: Record<MapStyleId, BasemapConfig> = {
  dark: {
    id: 'dark',
    label: 'Dark',
    baseUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    baseOptions: {
      maxNativeZoom: 16,
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri · api.data.gov.my',
    },
    overlayUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    overlayOptions: {
      maxNativeZoom: 16,
      maxZoom: 19,
      opacity: 0.92,
    },
  },
  street: {
    id: 'street',
    label: 'Street',
    baseUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    baseOptions: {
      maxNativeZoom: 18,
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri · api.data.gov.my',
    },
  },
  satellite: {
    id: 'satellite',
    label: 'Satellite',
    baseUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    baseOptions: {
      maxNativeZoom: 18,
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri · api.data.gov.my',
    },
    overlayUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    overlayOptions: {
      maxNativeZoom: 18,
      maxZoom: 19,
      opacity: 0.85,
    },
  },
};

function readInitialMapStyle(): MapStyleId {
  try {
    const saved = window.localStorage.getItem(MAP_STYLE_KEY);
    if (saved === 'dark' || saved === 'street' || saved === 'satellite') return saved;
  } catch {
    // ignore
  }
  return 'dark';
}

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
  const accent = bus.category === 'rapid-bus-mrtfeeder' ? '#ef4436' : '#3b82f6';
  const scale = isSelected ? 1.18 : 1;
  const ageTxt =
    bus.updatedSecondsAgo < 60
      ? `${bus.updatedSecondsAgo}s`
      : `${Math.round(bus.updatedSecondsAgo / 60)}m`;

  // Transit-App inspired crisp circular bus badge + directional heading arrow + live GPS age badge + chunky route pill
  const html = `
    <div style="transform: scale(${scale}); display:flex; flex-direction:column; align-items:center; pointer-events:auto; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.55));">
      <div style="position:relative; width:38px; height:38px; display:flex; align-items:center; justify-content:center;">
        <!-- Rotating heading pointer around the badge -->
        <div style="position:absolute; inset:0; transform:rotate(${bus.bearing}deg); will-change:transform;">
          <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
            <path d="M19 0 L24 8 L14 8 Z" fill="${accent}" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round" />
          </svg>
        </div>
        <!-- Crisp white Transit circle with front-facing bus & live signal arc -->
        <div style="width:28px; height:28px; border-radius:9999px; background:#ffffff; border:2.4px solid ${accent}; display:flex; align-items:center; justify-content:center; position:relative; z-index:2;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M7.5 3.2C9.8 1.9 14.2 1.9 16.5 3.2" stroke="${accent}" stroke-width="2" stroke-linecap="round" opacity="0.7" />
            <rect x="5" y="6" width="14" height="12" rx="3.2" fill="${accent}" />
            <rect x="7" y="8" width="10" height="4.5" rx="1.2" fill="#ffffff" />
            <circle cx="8.2" cy="15.2" r="1.2" fill="#ffffff" />
            <circle cx="15.8" cy="15.2" r="1.2" fill="#ffffff" />
            <rect x="6.5" y="18" width="2.4" height="2" rx="1" fill="${accent}" />
            <rect x="15.1" y="18" width="2.4" height="2" rx="1" fill="${accent}" />
          </svg>
        </div>
        <!-- Compact live GPS age pill like Transit App ("12s" / "1m") -->
        <div style="position:absolute; top:-2px; right:-6px; z-index:3; background:${accent}; color:#ffffff; border:1.5px solid #0b0f17; border-radius:9999px; padding:0 4px; font-family:'Nunito',sans-serif; font-size:9px; font-weight:900; line-height:13px;">${ageTxt}</div>
      </div>
      <div style="
        margin-top:-2px;
        background:${accent};
        color:#FFFFFF;
        border:1.8px solid #ffffff;
        border-radius:8px;
        padding:0px 6px;
        font-family:'Nunito',sans-serif;
        font-size:10px;
        font-weight:900;
        line-height:15px;
        white-space:nowrap;
        letter-spacing:-0.01em;
      ">${bus.routeShortName}</div>
    </div>
  `;

  return L.divIcon({
    html,
    className: 'kl-bus-div-icon',
    iconSize: [48, 52],
    iconAnchor: [24, 19],
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
  const overlayTileLayerRef = useRef<L.TileLayer | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyleId>(readInitialMapStyle);
  const railLinesLayerRef = useRef<L.LayerGroup | null>(null);
  const stationsLayerRef = useRef<L.LayerGroup | null>(null);
  const busRouteLayerRef = useRef<L.LayerGroup | null>(null);
  const busesLayerRef = useRef<L.LayerGroup | null>(null);
  const userLocationLayerRef = useRef<L.LayerGroup | null>(null);
  const pendingFocusRef = useRef<{ lat: number; lon: number; zoom: number } | null>(null);
  const hasRenderedVisibleRef = useRef(false);

  const cycleMapStyle = () => {
    const order: MapStyleId[] = ['dark', 'street', 'satellite'];
    const next = order[(order.indexOf(mapStyle) + 1) % order.length];
    setMapStyle(next);
    try {
      window.localStorage.setItem(MAP_STYLE_KEY, next);
    } catch {
      // ignore
    }
  };

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

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: KL_CENTER,
      zoom: KL_DEFAULT_ZOOM,
      zoomControl: false,
      preferCanvas: false,
      fadeAnimation: true,
    });

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
      overlayTileLayerRef.current = null;
      hasRenderedVisibleRef.current = false;
    };
  }, []);

  // Swap basemap tiles cleanly whenever mapStyle changes (Dark / Street / Satellite)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }
    if (overlayTileLayerRef.current) {
      map.removeLayer(overlayTileLayerRef.current);
      overlayTileLayerRef.current = null;
    }

    const cfg = BASEMAP_CONFIGS[mapStyle];
    let errorCount = 0;
    const baseLayer = L.tileLayer(cfg.baseUrl, cfg.baseOptions);
    baseLayer.on('tileload', () => {
      errorCount = 0;
    });
    baseLayer.on('tileerror', () => {
      errorCount += 1;
      if (errorCount >= 6 && mapStyle === 'dark') {
        setMapStyle('street');
      }
    });
    baseLayer.addTo(map);
    baseLayer.bringToBack();
    tileLayerRef.current = baseLayer;

    if (cfg.overlayUrl) {
      const overlayLayer = L.tileLayer(cfg.overlayUrl, cfg.overlayOptions);
      overlayLayer.addTo(map);
      overlayTileLayerRef.current = overlayLayer;
    }
  }, [mapStyle]);

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
    <div className="relative w-full h-full bg-[#16191f]">
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {/* Mobile Floating Transit Dark Layer Switcher (top-left) */}
      <div className="md:hidden absolute top-3.5 left-3.5 z-[400] inline-flex items-center gap-1 p-1 rounded-2xl bg-[#111622]/92 backdrop-blur-md border border-white/15 shadow-xl">
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
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold transition-all active:scale-95 cursor-pointer ${
                active
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Bus Filter Banner on Map */}
      {activeBusFilterLabel && (
        <div className="absolute top-16 md:top-3.5 left-3.5 z-[400] inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-[#ef4436] text-white shadow-xl text-xs font-extrabold border border-white/25">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
          <span>{t.mapBusFilterChip(activeBusFilterLabel, visibleMapBuses.length)}</span>
          <button
            type="button"
            onClick={onClearBusFilter}
            aria-label={t.clearFilters}
            className="w-5 h-5 inline-flex items-center justify-center rounded-full bg-black/25 hover:bg-black/40 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Sleek Dark Floating Map Controls (top-right) */}
      <div className="absolute top-3.5 right-3.5 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={onRequestLocation}
          disabled={isLocating}
          aria-label={t.mapGpsTitle}
          title={t.mapGpsTitle}
          className="inline-flex items-center justify-center gap-2 h-11 min-w-11 px-3 sm:px-3.5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:opacity-70 text-slate-950 rounded-2xl shadow-lg shadow-emerald-950/40 text-xs font-extrabold transition-all cursor-pointer"
        >
          <LocateFixed className={`w-4.5 h-4.5 ${isLocating ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">
            {isLocating ? t.locatingShort : t.mapGpsLabel}
          </span>
        </button>

        <button
          type="button"
          onClick={cycleMapStyle}
          aria-label="Switch map style"
          title={`Map style: ${BASEMAP_CONFIGS[mapStyle].label}`}
          className="inline-flex items-center justify-center gap-2 h-11 min-w-11 px-3 sm:px-3.5 bg-[#111622]/92 hover:bg-[#1a2233] active:scale-95 text-white border border-white/15 rounded-2xl shadow-lg text-xs font-bold transition-all cursor-pointer"
        >
          {mapStyle === 'dark' ? (
            <Moon className="w-4 h-4 text-emerald-400" />
          ) : mapStyle === 'street' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Globe2 className="w-4 h-4 text-sky-400" />
          )}
          <span className="hidden sm:inline">{BASEMAP_CONFIGS[mapStyle].label}</span>
        </button>

        <button
          type="button"
          onClick={handleRecenter}
          aria-label={t.mapRecenterTitle}
          title={t.mapRecenterTitle}
          className="inline-flex items-center justify-center gap-2 h-11 min-w-11 px-3 sm:px-3.5 bg-[#111622]/92 hover:bg-[#1a2233] active:scale-95 text-white border border-white/15 rounded-2xl shadow-lg text-xs font-bold transition-all cursor-pointer"
        >
          <Crosshair className="w-4.5 h-4.5 text-slate-300" />
          <span className="hidden sm:inline">{t.mapRecenterLabel}</span>
        </button>

        <button
          type="button"
          onClick={onToggleMode}
          aria-label={t.mapLayerTitle}
          title={t.mapLayerTitle}
          className="hidden md:inline-flex items-center justify-center gap-2 h-11 min-w-11 px-3 sm:px-3.5 bg-[#111622]/92 hover:bg-[#1a2233] active:scale-95 text-white border border-white/15 rounded-2xl shadow-lg text-xs font-bold transition-all cursor-pointer"
        >
          <Layers className="w-4.5 h-4.5 text-slate-300" />
          <span className="hidden sm:inline">
            {mode === 'rail'
              ? t.mapLayerShowBus
              : mode === 'bus'
                ? t.mapLayerShowRail
                : t.mapLayerAll}
          </span>
        </button>
      </div>

      {/* Mobile Interactive Transit-Style Preview Card (Color-Coded + Big GO button!) */}
      {(selectedStationObj || selectedBus || focusedBusStop) && (() => {
        const previewPalette = selectedBus
          ? getTransitPalette(
              selectedBus.color,
              selectedBus.category === 'rapid-bus-mrtfeeder' ? 'feeder' : 'rapid-bus'
            )
          : selectedStationObj
            ? getTransitPalette(selectedStationObj.routeColor, 'rail', selectedStationObj.routeId)
            : getTransitPalette('#10b981', 'rail', 'KGL');

        return (
          <div
            className="md:hidden absolute bottom-3 left-3 right-16 z-[450] backdrop-blur-md rounded-3xl shadow-2xl p-4 space-y-3 border"
            style={{
              backgroundColor: previewPalette.bandBg,
              borderColor: previewPalette.border,
            }}
          >
            {selectedStationObj ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className="text-xl font-black leading-none tracking-tight"
                      style={{ color: previewPalette.accent }}
                    >
                      {selectedStationObj.stopId}
                    </div>
                    <div className="mt-1 text-base font-extrabold text-white truncate">
                      {selectedStationObj.displayName}
                    </div>
                    <div className="text-xs truncate" style={{ color: previewPalette.muted }}>
                      {selectedStationObj.category} {selectedStationObj.routeLongName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearMapSelection}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
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
                    className="flex-1 py-2.5 px-4 rounded-2xl text-white text-sm font-black inline-flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md"
                    style={{ backgroundColor: previewPalette.vivid }}
                  >
                    <Navigation className="w-4 h-4" />
                    <span>GO · {t.directionsBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleTrackStation(selectedStationObj.stopId)}
                    className={`py-2.5 px-3 rounded-2xl text-xs font-bold inline-flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
                      trackingId === `rail:${selectedStationObj.stopId}`
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-white/12 text-white'
                    }`}
                  >
                    {trackingId === `rail:${selectedStationObj.stopId}` ? (
                      <BellRing className="w-4 h-4" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectStation(selectedStationObj.stopId, true)}
                    className="py-2.5 px-3.5 rounded-2xl bg-white/12 text-white text-xs font-extrabold active:scale-95 transition-all cursor-pointer"
                  >
                    {t.mapPreviewSchedule}
                  </button>
                </div>
              </>
            ) : selectedBus ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className="text-2xl font-black leading-none tracking-tight"
                      style={{ color: previewPalette.accent }}
                    >
                      {selectedBus.routeShortName}
                    </div>
                    <div className="mt-1 text-sm font-extrabold text-white truncate">
                      → {selectedBus.headsign || selectedBus.routeLongName}
                    </div>
                    <div className="text-xs truncate" style={{ color: previewPalette.muted }}>
                      {selectedBus.speedKmh} km/h · {t.agoShort(selectedBus.updatedSecondsAgo)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearMapSelection}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
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
                    className="flex-1 py-2.5 px-4 rounded-2xl text-white text-sm font-black inline-flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md"
                    style={{ backgroundColor: previewPalette.vivid }}
                  >
                    <Navigation className="w-4 h-4" />
                    <span>GO</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleTrackBus(selectedBus)}
                    className={`py-2.5 px-3 rounded-2xl text-xs font-bold inline-flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
                      trackingId === `bus:${selectedBus.id}`
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-white/12 text-white'
                    }`}
                  >
                    {trackingId === `bus:${selectedBus.id}` ? (
                      <BellRing className="w-4 h-4" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectBus(selectedBus, true)}
                    className="py-2.5 px-3.5 rounded-2xl bg-white/12 text-white text-xs font-extrabold active:scale-95 transition-all cursor-pointer"
                  >
                    {t.mapPreviewDetails}
                  </button>
                </div>
              </>
            ) : focusedBusStop ? (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-base font-extrabold text-white truncate">
                      {focusedBusStop.stopName}
                    </div>
                    <div className="text-xs truncate" style={{ color: previewPalette.muted }}>
                      {focusedBusStop.stopCode ? `${focusedBusStop.stopCode} · ` : ''}
                      {focusedBusStop.category === 'rapid-bus-mrtfeeder'
                        ? 'MRT Feeder Bus Stop'
                        : 'Rapid Bus KL Stop'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearMapSelection}
                    className="w-7 h-7 inline-flex items-center justify-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
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
                    className="flex-1 py-2.5 px-4 rounded-2xl bg-emerald-500 text-slate-950 text-sm font-black inline-flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>GO</span>
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
                    className={`py-2.5 px-3.5 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer ${
                      matchesMyBusStationStrict(focusedBusStop, myBusStation)
                        ? 'bg-white text-slate-950'
                        : 'bg-white/14 text-white'
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
        );
      })()}

      {/* Compact Rapid KL Line Legend (bottom-left on desktop) */}
      {(mode === 'rail' || mode === 'all') && lines.length > 0 && (
        <div className="hidden lg:flex absolute bottom-4 left-4 z-[400] bg-[#111622]/90 backdrop-blur-md border border-white/12 rounded-2xl px-3.5 py-2 shadow-lg items-center gap-3 text-[11px] text-slate-300">
          {lines.slice(0, 7).map((line) => (
            <div key={line.routeId} className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="w-2.5 h-1 rounded-full shrink-0"
                style={{ backgroundColor: line.color }}
              />
              <span className="font-bold text-white">{line.shortName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
