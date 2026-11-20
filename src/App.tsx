import {
  ArrowRight,
  Bus,
  LocateFixed,
  Map as MapIcon,
  RotateCcw,
  Search,
  TrainFront,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BusLivePanel } from './components/BusLivePanel';
import { NearbyPanel } from './components/NearbyPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { StationDepartureBoard } from './components/StationDepartureBoard';
import { TopBar } from './components/TopBar';
import { TransitMap } from './components/TransitMap';
import type {
  BusCategory,
  BusRouteDetailPayload,
  LiveBusesPayload,
  LiveBusVehicle,
  NearbyBusStop,
  NearbyTransitPayload,
  RailNetworkPayload,
  StationDeparturePayload,
  TransitMode,
  UserLocation,
} from './types/transit';
import { normalizeSearch, POPULAR_KL_HUBS } from './utils/transitHelpers';

const AUTO_REFRESH_SECONDS = 5;

export default function App() {
  const [mode, setMode] = useState<TransitMode>('rail');
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');

  // Rail state
  const [railData, setRailData] = useState<RailNetworkPayload | null>(null);
  const [railLoading, setRailLoading] = useState(true);
  const [railError, setRailError] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string>('all');
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);

  // Station departures state
  const [departures, setDepartures] = useState<StationDeparturePayload | null>(null);
  const [departuresLoading, setDeparturesLoading] = useState(false);
  const [departuresError, setDeparturesError] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState<string>('');
  const [customDay, setCustomDay] = useState<'auto' | 'weekday' | 'sat' | 'sun'>('auto');

  // Live Bus state
  const [busData, setBusData] = useState<LiveBusesPayload | null>(null);
  const [busLoading, setBusLoading] = useState(false);
  const [busError, setBusError] = useState<string | null>(null);
  const [busCategoryFilter, setBusCategoryFilter] = useState<'all' | BusCategory>('all');
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [selectedBusRouteDetail, setSelectedBusRouteDetail] =
    useState<BusRouteDetailPayload | null>(null);
  const [loadingRouteDetail, setLoadingRouteDetail] = useState(false);

  // Unified search & 5s refresh cycle
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nextRefreshInSec, setNextRefreshInSec] = useState(AUTO_REFRESH_SECONDS);

  // User GPS & Nearby stops state
  const [showNearbyView, setShowNearbyView] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isSimulatedKl, setIsSimulatedKl] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [nearbyData, setNearbyData] = useState<NearbyTransitPayload | null>(null);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [focusedBusStop, setFocusedBusStop] = useState<NearbyBusStop | null>(null);

  // Fetch Rapid KL rail network
  const fetchRailNetwork = useCallback(async () => {
    setRailLoading(true);
    setRailError(null);
    try {
      const res = await fetch('/api/transit/rail');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Lỗi tải dữ liệu đường sắt');
      setRailData(json as RailNetworkPayload);
    } catch (err) {
      setRailError((err as Error).message || 'Không thể tải dữ liệu đường sắt Kuala Lumpur.');
    } finally {
      setRailLoading(false);
    }
  }, []);

  // Fetch station departures for chosen stopId
  const fetchStationDepartures = useCallback(
    async (stopId: string, time: string, day: 'auto' | 'weekday' | 'sat' | 'sun') => {
      setDeparturesLoading(true);
      setDeparturesError(null);
      try {
        const params = new URLSearchParams();
        if (time) params.set('time', time);
        if (day !== 'auto') params.set('day', day);
        const qs = params.toString();
        const res = await fetch(
          `/api/transit/station/${encodeURIComponent(stopId)}/departures${qs ? `?${qs}` : ''}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Không thể tải lịch tàu cho ga này');
        setDepartures(json as StationDeparturePayload);
      } catch (err) {
        setDeparturesError((err as Error).message || 'Lỗi kết nối lịch tàu.');
      } finally {
        setDeparturesLoading(false);
      }
    },
    []
  );

  // Fetch live GPS buses
  const fetchLiveBuses = useCallback(async (force = false) => {
    setBusLoading(true);
    setBusError(null);
    try {
      const res = await fetch(`/api/transit/buses/live${force ? '?force=1' : ''}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Không thể tải vị trí GPS xe bus');
      setBusData(json as LiveBusesPayload);
    } catch (err) {
      setBusError((err as Error).message || 'Lỗi kết nối luồng GPS xe bus.');
    } finally {
      setBusLoading(false);
    }
  }, []);

  // Fetch nearby MRT/LRT/Monorail stations & Rapid KL bus stops from coordinates
  const fetchNearbyStops = useCallback(async (lat: number, lon: number) => {
    setLoadingNearby(true);
    try {
      const res = await fetch(
        `/api/transit/nearby?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&limit=6`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Không thể tìm bến gần bạn');
      setNearbyData(json as NearbyTransitPayload);
    } catch (err) {
      setLocationError((err as Error).message || 'Lỗi tra cứu bến gần vị trí GPS.');
    } finally {
      setLoadingNearby(false);
    }
  }, []);

  // Request browser GPS permission & locate user
  const requestUserLocation = useCallback(() => {
    setShowNearbyView(true);
    setSelectedStationId(null);
    setSelectedBusId(null);
    setFocusedBusStop(null);
    setLocationError(null);
    setMobileView('list');

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError(
        'Trình duyệt của bạn không hỗ trợ GPS Geolocation. Bạn có thể bấm thử vị trí mẫu tại Kuala Lumpur.'
      );
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLoc: UserLocation = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy || 0,
          timestamp: Date.now(),
        };
        setLocating(false);
        setIsSimulatedKl(false);
        setUserLocation(nextLoc);
        fetchNearbyStops(nextLoc.lat, nextLoc.lon);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError(
            'Bạn chưa cấp quyền truy cập vị trí GPS cho trình duyệt. Hãy bật quyền Vị trí (Location) trong cài đặt trình duyệt rồi bấm thử lại.'
          );
        } else if (err.code === err.TIMEOUT) {
          setLocationError('Hết thời gian chờ tín hiệu GPS. Vui lòng thử lại ở nơi thoáng sóng.');
        } else {
          setLocationError('Không thể xác định vị trí GPS hiện tại. Vui lòng thử lại.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 10000,
      }
    );
  }, [fetchNearbyStops]);

  const handleTryKlSampleLocation = useCallback(() => {
    // Bukit Bintang KL central sample point for previewing walking distances when outside Malaysia
    const sampleLoc: UserLocation = {
      lat: 3.1466,
      lon: 101.7109,
      accuracyMeters: 25,
      timestamp: Date.now(),
    };
    setShowNearbyView(true);
    setLocationError(null);
    setIsSimulatedKl(true);
    setUserLocation(sampleLoc);
    fetchNearbyStops(sampleLoc.lat, sampleLoc.lon);
  }, [fetchNearbyStops]);

  // Initial data load
  useEffect(() => {
    fetchRailNetwork();
    fetchLiveBuses(false);
  }, [fetchRailNetwork, fetchLiveBuses]);

  // Load station departures when station, customTime, or customDay changes
  useEffect(() => {
    if (!selectedStationId) {
      setDepartures(null);
      return;
    }
    fetchStationDepartures(selectedStationId, customTime, customDay);
  }, [selectedStationId, customTime, customDay, fetchStationDepartures]);

  // Keep refs to latest live refresh parameters for clean 5-second auto-refresh timer
  const liveRefreshStateRef = useRef({
    selectedStationId,
    customTime,
    customDay,
  });
  useEffect(() => {
    liveRefreshStateRef.current = { selectedStationId, customTime, customDay };
  }, [selectedStationId, customTime, customDay]);

  // Unified 5-second auto-refresh tick for live GPS buses & live station departures
  useEffect(() => {
    let remaining = AUTO_REFRESH_SECONDS;
    const id = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        remaining = AUTO_REFRESH_SECONDS;
        setNextRefreshInSec(AUTO_REFRESH_SECONDS);
        // Silently refresh live GPS buses every 5s
        fetchLiveBuses(false);
        // Silently refresh active station departure countdown every 5s when in live MYT mode
        const {
          selectedStationId: curStopId,
          customTime: curTime,
          customDay: curDay,
        } = liveRefreshStateRef.current;
        if (curStopId && curTime === '') {
          fetchStationDepartures(curStopId, '', curDay);
        }
      } else {
        setNextRefreshInSec(remaining);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [fetchLiveBuses, fetchStationDepartures]);

  // Resolve currently selected live bus object from latest GPS poll
  const selectedBus = useMemo<LiveBusVehicle | null>(() => {
    if (!selectedBusId || !busData) return null;
    return busData.vehicles.find((v) => v.id === selectedBusId) || null;
  }, [selectedBusId, busData]);

  // Fetch bus route polyline & stops when user selects a live bus
  useEffect(() => {
    if (!selectedBus) {
      setSelectedBusRouteDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingRouteDetail(true);
    const params = new URLSearchParams();
    if (selectedBus.tripId) params.set('tripId', selectedBus.tripId);

    fetch(
      `/api/transit/buses/route/${encodeURIComponent(selectedBus.category)}/${encodeURIComponent(
        selectedBus.routeId || selectedBus.routeShortName
      )}${params.toString() ? `?${params.toString()}` : ''}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((json: BusRouteDetailPayload | null) => {
        if (!cancelled) setSelectedBusRouteDetail(json);
      })
      .catch(() => {
        if (!cancelled) setSelectedBusRouteDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingRouteDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBus?.id]);

  // Filtered rail stations for the sidebar list
  const filteredStations = useMemo(() => {
    if (!railData) return [];
    const q = normalizeSearch(searchQuery);
    return railData.stations.filter((st) => {
      if (selectedLineId !== 'all' && st.routeId !== selectedLineId) return false;
      if (!q) return true;
      return (
        normalizeSearch(st.displayName).includes(q) ||
        normalizeSearch(st.stopId).includes(q) ||
        normalizeSearch(st.routeLongName).includes(q) ||
        normalizeSearch(st.routeShortName).includes(q)
      );
    });
  }, [railData, selectedLineId, searchQuery]);

  const handleSelectStation = useCallback((stopId: string) => {
    setShowNearbyView(false);
    setFocusedBusStop(null);
    setSelectedStationId(stopId);
    setSelectedBusId(null);
    setMode((prev) => (prev === 'bus' ? 'all' : prev));
    setMobileView('list');
  }, []);

  const handleSelectBus = useCallback((bus: LiveBusVehicle | null) => {
    if (bus) setShowNearbyView(false);
    setFocusedBusStop(null);
    setSelectedBusId(bus ? bus.id : null);
    if (bus) {
      setSelectedStationId(null);
      setMode((prev) => (prev === 'rail' ? 'bus' : prev));
      setMobileView('list');
    }
  }, []);

  const handleSelectNearbyBusStop = useCallback((stop: NearbyBusStop) => {
    setFocusedBusStop(stop);
    setMode('all');
    setMobileView('map');
  }, []);

  const handleModeChange = useCallback((nextMode: TransitMode) => {
    setMode(nextMode);
    setShowNearbyView(false);
    if (nextMode === 'bus') {
      setSelectedStationId(null);
    } else if (nextMode === 'rail') {
      setSelectedBusId(null);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setNextRefreshInSec(AUTO_REFRESH_SECONDS);
    try {
      const tasks: Promise<unknown>[] = [fetchLiveBuses(true)];
      if (selectedStationId) {
        tasks.push(fetchStationDepartures(selectedStationId, customTime, customDay));
      } else if (!railData) {
        tasks.push(fetchRailNetwork());
      }
      if (userLocation && showNearbyView) {
        tasks.push(fetchNearbyStops(userLocation.lat, userLocation.lon));
      }
      await Promise.all(tasks);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    fetchLiveBuses,
    selectedStationId,
    fetchStationDepartures,
    customTime,
    customDay,
    railData,
    fetchRailNetwork,
    userLocation,
    showNearbyView,
    fetchNearbyStops,
  ]);

  const handleToggleMapLayer = useCallback(() => {
    setMode((prev) => (prev === 'rail' ? 'all' : prev === 'bus' ? 'all' : 'rail'));
  }, []);

  // Decide which panel content renders in the left workspace
  const showingBusPanel = mode === 'bus' || (mode === 'all' && selectedBus !== null);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden">
      <TopBar
        mode={mode}
        onModeChange={handleModeChange}
        onRefresh={handleManualRefresh}
        isRefreshing={isRefreshing}
        nextRefreshInSec={nextRefreshInSec}
      />

      {/* Main Split Workspace */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Interactive Transit Panel */}
        <aside
          className={`${
            mobileView === 'list' ? 'flex' : 'hidden'
          } md:flex flex-col w-full md:w-[420px] lg:w-[440px] shrink-0 bg-white border-r border-slate-200 min-h-0 z-20`}
        >
          {/* Unified Search Bar + GPS Nearby Trigger */}
          <div className="p-4 border-b border-slate-200 shrink-0 bg-white space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (showNearbyView) setShowNearbyView(false);
                  }}
                  placeholder={
                    showingBusPanel
                      ? 'Tìm tuyến bus (400, T565)…'
                      : 'Tìm ga MRT/LRT (KLCC, TRX, KG16)…'
                  }
                  className="w-full pl-10 pr-8 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    aria-label="Xóa từ khóa tìm kiếm"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={requestUserLocation}
                disabled={locating}
                title="Xin quyền GPS tìm ga MRT/LRT và trạm xe Bus gần nhất"
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showNearbyView
                    ? 'bg-sky-600 border-sky-600 text-white'
                    : 'bg-sky-50 border-sky-200 text-sky-800 hover:bg-sky-100'
                }`}
              >
                <LocateFixed className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`} />
                <span>Gần tôi</span>
              </button>
            </div>

            {/* Rail Line Filter Bar when viewing Rail station list */}
            {!showNearbyView && !showingBusPanel && !selectedStationId && railData && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 transit-scroll">
                <button
                  type="button"
                  onClick={() => setSelectedLineId('all')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    selectedLineId === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tất cả ({railData.lines.length})
                </button>
                {railData.lines.map((line) => {
                  const active = selectedLineId === line.routeId;
                  return (
                    <button
                      key={line.routeId}
                      type="button"
                      onClick={() => setSelectedLineId(line.routeId)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: line.color }}
                      />
                      <span className="font-mono font-semibold">{line.shortName}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Quick mode switch note when in 'all' mode */}
            {mode === 'all' && !selectedStationId && !selectedBus && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                <span>Đang hiện tàu & {busData?.counts.total ?? 0} xe bus GPS trên bản đồ</span>
                <button
                  type="button"
                  onClick={() => setMode('bus')}
                  className="font-medium text-sky-700 hover:text-sky-900 cursor-pointer whitespace-nowrap"
                >
                  Xem DS Bus →
                </button>
              </div>
            )}
          </div>

          {/* Scrollable Panel Body */}
          <div className="flex-1 overflow-y-auto transit-scroll min-h-0">
            {showNearbyView ? (
              <NearbyPanel
                userLocation={userLocation}
                nearbyData={nearbyData}
                locating={locating}
                loadingNearby={loadingNearby}
                locationError={locationError}
                isSimulatedKl={isSimulatedKl}
                onRequestGps={requestUserLocation}
                onTryKlSample={handleTryKlSampleLocation}
                onSelectStation={handleSelectStation}
                onSelectBusStop={handleSelectNearbyBusStop}
                onBack={() => setShowNearbyView(false)}
              />
            ) : showingBusPanel ? (
              <BusLivePanel
                data={busData}
                loading={busLoading}
                error={busError}
                searchQuery={searchQuery}
                busCategoryFilter={busCategoryFilter}
                selectedBus={selectedBus}
                selectedBusRouteDetail={selectedBusRouteDetail}
                loadingRouteDetail={loadingRouteDetail}
                onCategoryChange={setBusCategoryFilter}
                onSelectBus={handleSelectBus}
                onRetry={() => fetchLiveBuses(true)}
              />
            ) : selectedStationId ? (
              <StationDepartureBoard
                data={departures}
                loading={departuresLoading}
                error={departuresError}
                customTime={customTime}
                customDay={customDay}
                onCustomTimeChange={setCustomTime}
                onCustomDayChange={setCustomDay}
                onSelectStation={handleSelectStation}
                onBack={() => setSelectedStationId(null)}
                onRetry={() =>
                  selectedStationId &&
                  fetchStationDepartures(selectedStationId, customTime, customDay)
                }
              />
            ) : (
              <div className="p-4 space-y-6">
                {railLoading && !railData ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-4 w-36 bg-slate-200 rounded" />
                    <div className="grid grid-cols-2 gap-2">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <div key={n} className="h-14 bg-slate-100 rounded-xl" />
                      ))}
                    </div>
                    <div className="h-4 w-28 bg-slate-200 rounded mt-4" />
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="h-12 bg-slate-100 rounded-xl" />
                    ))}
                  </div>
                ) : railError && !railData ? (
                  <div className="p-5 border border-red-200 bg-red-50 rounded-xl space-y-3">
                    <p className="text-sm font-medium text-red-900">{railError}</p>
                    <button
                      type="button"
                      onClick={fetchRailNetwork}
                      className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Tải lại dữ liệu</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Popular KL Hubs for 1-click departure check */}
                    {!searchQuery && selectedLineId === 'all' && (
                      <section className="space-y-2.5">
                        <div className="flex items-baseline justify-between px-0.5">
                          <h2 className="font-display text-sm font-bold text-slate-900">
                            Ga trung tâm phổ biến · Popular Hubs
                          </h2>
                          <span className="text-xs text-slate-400">Chạm để xem giờ tàu</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {POPULAR_KL_HUBS.map((hub) => {
                            const match = railData?.stations.find((s) => s.stopId === hub.stopId);
                            return (
                              <button
                                key={hub.stopId}
                                type="button"
                                onClick={() => handleSelectStation(hub.stopId)}
                                className="p-3 text-left bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl transition-colors cursor-pointer space-y-1"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-2 h-2 rounded-xs shrink-0"
                                    style={{ backgroundColor: match?.routeColor || '#047857' }}
                                  />
                                  <span className="font-mono text-[11px] font-bold text-slate-500">
                                    {hub.stopId}
                                  </span>
                                </div>
                                <div className="font-display text-sm font-bold text-slate-900 truncate">
                                  {hub.label}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">{hub.sub}</div>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* Full Searchable Station Directory */}
                    <section className="space-y-2.5">
                      <div className="flex items-baseline justify-between px-0.5">
                        <h2 className="font-display text-sm font-bold text-slate-900">
                          {selectedLineId === 'all'
                            ? 'Danh sách ga Rapid KL'
                            : railData?.lines.find((l) => l.routeId === selectedLineId)
                                ?.longName || 'Danh sách ga'}
                        </h2>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          {filteredStations.length} ga
                        </span>
                      </div>

                      {filteredStations.length === 0 ? (
                        <div className="p-6 text-center border border-slate-200 rounded-xl space-y-1.5">
                          <p className="text-sm font-medium text-slate-800">
                            Không tìm thấy ga phù hợp
                          </p>
                          <p className="text-xs text-slate-500">
                            Thử tìm theo tên tiếng Anh chuẩn như KLCC, Pasar Seni, Sentral, Kajang…
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                          {filteredStations.map((st) => (
                            <button
                              key={st.stopId}
                              type="button"
                              onClick={() => handleSelectStation(st.stopId)}
                              className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 text-left transition-colors cursor-pointer"
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
                                    {st.interchanges.length > 0
                                      ? ` · Trung chuyển (${st.interchanges
                                          .map((i) => i.routeShortName)
                                          .join(', ')})`
                                      : ''}
                                  </p>
                                </div>
                              </div>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* Clean data attribution footer */}
                    {railData && (
                      <div className="pt-2 pb-4 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>Dữ liệu chính thức: {railData.source}</span>
                        <span className="font-mono tabular-nums">{railData.lines.length} tuyến</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Compact PWA Install Bar (auto-hides once installed as standalone app) */}
          <PWAInstallButton />
        </aside>

        {/* Right Full-Viewport Interactive Kuala Lumpur Map */}
        <main
          className={`${
            mobileView === 'map' ? 'block' : 'hidden'
          } md:block flex-1 min-w-0 h-full relative`}
        >
          <TransitMap
            mode={mode}
            lines={railData?.lines || []}
            stations={railData?.stations || []}
            selectedLineId={selectedLineId}
            selectedStationId={selectedStationId}
            liveBuses={busData?.vehicles || []}
            busCategoryFilter={busCategoryFilter}
            selectedBus={selectedBus}
            selectedBusRouteDetail={selectedBusRouteDetail}
            userLocation={userLocation}
            focusedBusStop={focusedBusStop}
            isLocating={locating}
            onSelectStation={handleSelectStation}
            onSelectBus={handleSelectBus}
            onToggleMode={handleToggleMapLayer}
            onRequestLocation={requestUserLocation}
          />
        </main>

        {/* Mobile Floating View Switcher (keeps sticky footprint compact <= 15%) */}
        <div className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-[500]">
          <button
            type="button"
            onClick={() => setMobileView((v) => (v === 'list' ? 'map' : 'list'))}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-full shadow-lg cursor-pointer"
          >
            {mobileView === 'list' ? (
              <>
                <MapIcon className="w-4 h-4" />
                <span>Xem bản đồ KL</span>
              </>
            ) : showingBusPanel ? (
              <>
                <Bus className="w-4 h-4" />
                <span>Danh sách xe Bus</span>
              </>
            ) : (
              <>
                <TrainFront className="w-4 h-4" />
                <span>Bảng giờ tàu</span>
              </>
            )}
          </button>
        </div>

        <OfflineIndicator />
      </div>
    </div>
  );
}
