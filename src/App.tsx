import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import {
  ArrowRight,
  Bus,
  Home,
  LocateFixed,
  Map as MapIcon,
  Navigation,
  Radio,
  RotateCcw,
  Route,
  Search,
  Settings2,
  Star,
  TrainFront,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BusLivePanel } from './components/BusLivePanel';
import { DirectionsSheet } from './components/DirectionsSheet';
import { FontPickerModal } from './components/FontPickerModal';
import { LiveTrackerPill, type ActiveTrackerDisplay } from './components/LiveTrackerPill';
import { MyStationSetupModal } from './components/MyStationSetupModal';
import { NearbyPanel } from './components/NearbyPanel';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PullToRefresh } from './components/PullToRefresh';
import { PWAInstallButton } from './components/PWAInstallButton';
import { StationDepartureBoard } from './components/StationDepartureBoard';
import { TopBar } from './components/TopBar';
import { TransitMap } from './components/TransitMap';
import { TripPlannerModal } from './components/TripPlannerModal';
import { useAppFont } from './hooks/useAppFont';
import { useFavoriteStations } from './hooks/useFavorites';
import { useMyStations, type MyBusStation, type MyRailStation } from './hooks/useMyStations';
import { translations, useLanguage } from './i18n';
import { liveNotificationService } from './services/liveNotificationService';
import { transitApi } from './services/transitApi';
import type {
  BusCategory,
  BusRouteDetailPayload,
  LiveBusesPayload,
  LiveBusVehicle,
  MyBusStationArrival,
  NearbyBusStop,
  NearbyTransitPayload,
  RailNetworkPayload,
  StationDeparturePayload,
  TransitMode,
  UserLocation,
} from './types/transit';
import { interpolateLiveVehicles } from './utils/busApproach';
import type { DirectionsTarget } from './utils/directionsHelper';
import { formatCountdown, normalizeSearch, POPULAR_KL_HUBS } from './utils/transitHelpers';

const REALTIME_NETWORK_POLL_MS = 2500;

type TrackedTarget =
  | { kind: 'rail'; stopId: string }
  | { kind: 'bus'; busId: string }
  | null;

export default function App() {
  const { lang, setLang } = useLanguage();
  const t = translations[lang];
  const { fontFamily, setAppFont, loadingFont } = useAppFont();
  const { favoriteIds, toggleFavorite, isFavorite } = useFavoriteStations();
  const { myBusStation, setMyBusStation, myRailStation, setMyRailStation } = useMyStations();

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
  const [busDataFetchedAtMs, setBusDataFetchedAtMs] = useState<number>(() => Date.now());
  const [busLoading, setBusLoading] = useState(false);
  const [busError, setBusError] = useState<string | null>(null);
  const [busCategoryFilter, setBusCategoryFilter] = useState<'all' | BusCategory>('all');
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  const [selectedBusRouteDetail, setSelectedBusRouteDetail] =
    useState<BusRouteDetailPayload | null>(null);
  const [loadingRouteDetail, setLoadingRouteDetail] = useState(false);

  // Separate search queries for Rail & Bus + real-time 1s ticker
  const [railSearchQuery, setRailSearchQuery] = useState('');
  const [busSearchQuery, setBusSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realtimeNowMs, setRealtimeNowMs] = useState<number>(() => Date.now());
  const [focusMyStationSeq, setFocusMyStationSeq] = useState(0);

  // User GPS & Nearby stops state
  const [showNearbyView, setShowNearbyView] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [isSimulatedKl, setIsSimulatedKl] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [nearbyData, setNearbyData] = useState<NearbyTransitPayload | null>(null);
  const [loadingNearby, setLoadingNearby] = useState(false);
  const [focusedBusStop, setFocusedBusStop] = useState<NearbyBusStop | null>(null);

  // New UX modals & Lock-Screen Live Tracking state
  const [directionsTarget, setDirectionsTarget] = useState<DirectionsTarget | null>(null);
  const [tripPlannerOpen, setTripPlannerOpen] = useState(false);
  const [tripPlannerTab, setTripPlannerTab] = useState<'rail' | 'bus'>('rail');
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const [myStationSetupMode, setMyStationSetupMode] = useState<'rail' | 'bus' | null>(null);
  const [myRailDepartures, setMyRailDepartures] = useState<StationDeparturePayload | null>(null);
  const [myBusArrivals, setMyBusArrivals] = useState<MyBusStationArrival[]>([]);
  const [myBusArrivalsLoading, setMyBusArrivalsLoading] = useState(false);
  const [trackedTarget, setTrackedTarget] = useState<TrackedTarget>(null);
  const [trackedDepartures, setTrackedDepartures] = useState<StationDeparturePayload | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Read optional deep-link query params (?station=KJ10&lang=en) on initial load
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const qLang = params.get('lang');
      if (qLang === 'vi' || qLang === 'en') {
        setLang(qLang);
      }
      const qStation = params.get('station');
      if (qStation) {
        setSelectedStationId(qStation.trim().toUpperCase());
        setMode('rail');
        setMobileView('list');
      }
    } catch {
      // ignore invalid URL
    }
  }, [setLang]);

  // Fetch Rapid KL rail network
  const fetchRailNetwork = useCallback(async () => {
    setRailLoading(true);
    setRailError(null);
    try {
      const json = await transitApi.getRailNetwork();
      setRailData(json);
    } catch (err) {
      setRailError((err as Error).message || t.railLoadError);
    } finally {
      setRailLoading(false);
    }
  }, [t.railLoadError]);

  // Fetch station departures for chosen stopId
  const fetchStationDepartures = useCallback(
    async (stopId: string, time: string, day: 'auto' | 'weekday' | 'sat' | 'sun') => {
      setDeparturesLoading(true);
      setDeparturesError(null);
      try {
        const json = await transitApi.getStationDepartures(stopId, time, day);
        setDepartures(json);
      } catch (err) {
        setDeparturesError((err as Error).message || t.departuresLoadError);
      } finally {
        setDeparturesLoading(false);
      }
    },
    [t.departuresLoadError]
  );

  // Silently fetch tracked station departures in background for Lock-Screen Live Notification
  const refreshTrackedStation = useCallback(async (stopId: string) => {
    try {
      const json = await transitApi.getStationDepartures(stopId, '', 'auto');
      setTrackedDepartures(json);
    } catch {
      // keep last known snapshot
    }
  }, []);

  // Fetch live GPS buses (staggered anti-429 real-time polling)
  const fetchLiveBuses = useCallback(
    async (force = false, priorityCategory?: BusCategory) => {
      setBusLoading(true);
      setBusError(null);
      try {
        const json = await transitApi.getLiveBuses(force, priorityCategory);
        setBusData(json);
        setBusDataFetchedAtMs(Date.now());
      } catch (err) {
        setBusError((err as Error).message || t.busLoadError);
      } finally {
        setBusLoading(false);
      }
    },
    [t.busLoadError]
  );

  // Fetch nearby MRT/LRT/Monorail stations & Rapid KL bus stops from coordinates
  const fetchNearbyStops = useCallback(
    async (lat: number, lon: number) => {
      setLoadingNearby(true);
      try {
        const json = await transitApi.getNearbyTransit(lat, lon, 6);
        setNearbyData(json);
      } catch (err) {
        setLocationError((err as Error).message || t.nearbyLoadError);
      } finally {
        setLoadingNearby(false);
      }
    },
    [t.nearbyLoadError]
  );

  // Request GPS permission & locate user (supports both Native Android Capacitor & Web Browser)
  const locateUser = useCallback(
    async (openNearbyPanel: boolean) => {
      if (openNearbyPanel) {
        setShowNearbyView(true);
        setSelectedStationId(null);
        setSelectedBusId(null);
        setFocusedBusStop(null);
        setMobileView('list');
      }
      setLocationError(null);

      if (Capacitor.isNativePlatform()) {
        setLocating(true);
        try {
          const perm = await Geolocation.requestPermissions();
          if (perm.location === 'denied' && perm.coarseLocation === 'denied') {
            setLocating(false);
            setLocationError(t.gpsDeniedAndroid);
            return;
          }
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 10000,
          });
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
        } catch {
          setLocating(false);
          setLocationError(t.gpsGenericError);
        }
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setLocationError(t.gpsUnsupported);
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
            setLocationError(t.gpsDeniedBrowser);
          } else if (err.code === err.TIMEOUT) {
            setLocationError(t.gpsTimeout);
          } else {
            setLocationError(t.gpsUnavailable);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 10000,
        }
      );
    },
    [
      fetchNearbyStops,
      t.gpsDeniedAndroid,
      t.gpsDeniedBrowser,
      t.gpsGenericError,
      t.gpsTimeout,
      t.gpsUnavailable,
      t.gpsUnsupported,
    ]
  );

  const requestUserLocation = useCallback(() => locateUser(true), [locateUser]);
  const requestUserLocationSilent = useCallback(() => locateUser(false), [locateUser]);

  const handleTryKlSampleLocation = useCallback(() => {
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

  // Listen for native Android "Stop" action directly from the Lock-Screen notification
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    liveNotificationService
      .onStoppedFromNotification(() => {
        setTrackedTarget(null);
        setTrackedDepartures(null);
      })
      .then((fn) => {
        cleanup = fn;
      });
    return () => {
      cleanup?.();
    };
  }, []);

  // Load station departures when station, customTime, or customDay changes
  useEffect(() => {
    if (!selectedStationId) {
      setDepartures(null);
      return;
    }
    fetchStationDepartures(selectedStationId, customTime, customDay);
  }, [selectedStationId, customTime, customDay, fetchStationDepartures]);

  // Sync tracked station departures whenever trackedTarget is a rail station
  useEffect(() => {
    if (trackedTarget?.kind === 'rail') {
      refreshTrackedStation(trackedTarget.stopId);
    } else {
      setTrackedDepartures(null);
    }
  }, [trackedTarget, refreshTrackedStation]);

  // Silently fetch My Rail Station live departures so user sees countdown right on app open
  const refreshMyRailStation = useCallback(async (stopId: string) => {
    try {
      const json = await transitApi.getStationDepartures(stopId, '', 'auto');
      setMyRailDepartures(json);
    } catch {
      // keep previous snapshot
    }
  }, []);

  // Load My Rail Station departures whenever myRailStation changes
  useEffect(() => {
    if (!myRailStation) {
      setMyRailDepartures(null);
      return;
    }
    refreshMyRailStation(myRailStation.stopId);
  }, [myRailStation, refreshMyRailStation]);

  // Keep refs for real-time staggered polling loop
  const liveRefreshStateRef = useRef({
    selectedStationId,
    customTime,
    customDay,
    trackedTarget,
    busCategoryFilter,
    myRailStation,
    selectedBusCategory: undefined as BusCategory | undefined,
  });
  useEffect(() => {
    liveRefreshStateRef.current = {
      selectedStationId,
      customTime,
      customDay,
      trackedTarget,
      busCategoryFilter,
      myRailStation,
      selectedBusCategory:
        busData?.vehicles.find((v) => v.id === selectedBusId)?.category || undefined,
    };
  }, [
    selectedStationId,
    customTime,
    customDay,
    trackedTarget,
    busCategoryFilter,
    myRailStation,
    busData,
    selectedBusId,
  ]);

  // Smooth 1-second real-time UI tick (dead-reckoned bus motion + live seconds counters)
  useEffect(() => {
    const id = setInterval(() => {
      setRealtimeNowMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Fast staggered real-time network loop (2.5s alternating KL <-> Feeder to stay 429-free)
  useEffect(() => {
    let tickCount = 0;
    const id = setInterval(() => {
      tickCount += 1;
      const {
        selectedStationId: curStopId,
        customTime: curTime,
        customDay: curDay,
        trackedTarget: curTracked,
        busCategoryFilter: curCat,
        myRailStation: curMyRail,
        selectedBusCategory: curSelBusCat,
      } = liveRefreshStateRef.current;

      const priorityCat: BusCategory | undefined =
        curSelBusCat || (curCat !== 'all' ? curCat : undefined);
      fetchLiveBuses(false, priorityCat);

      if (tickCount % 2 === 0) {
        if (curStopId && curTime === '') {
          fetchStationDepartures(curStopId, '', curDay);
        }
        if (curTracked?.kind === 'rail') {
          refreshTrackedStation(curTracked.stopId);
        }
        if (curMyRail) {
          refreshMyRailStation(curMyRail.stopId);
        }
      }
    }, REALTIME_NETWORK_POLL_MS);
    return () => clearInterval(id);
  }, [fetchLiveBuses, fetchStationDepartures, refreshTrackedStation, refreshMyRailStation]);

  // Real-time smoothly interpolated live bus fleet (updates every 1s between GTFS-RT polls)
  const realtimeBusVehicles = useMemo<LiveBusVehicle[]>(() => {
    if (!busData?.vehicles.length) return [];
    return interpolateLiveVehicles(busData.vehicles, busDataFetchedAtMs, realtimeNowMs);
  }, [busData, busDataFetchedAtMs, realtimeNowMs]);

  // Compute top 3 direction-verified unique-route buses approaching My Bus Station
  useEffect(() => {
    if (!myBusStation || !busData?.vehicles.length) {
      setMyBusArrivals([]);
      return;
    }
    let cancelled = false;
    setMyBusArrivalsLoading(true);
    transitApi
      .getMyBusStationArrivals(myBusStation, busData.vehicles, 3)
      .then((list) => {
        if (!cancelled) setMyBusArrivals(list);
      })
      .catch(() => {
        if (!cancelled) setMyBusArrivals([]);
      })
      .finally(() => {
        if (!cancelled) setMyBusArrivalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [myBusStation, busData]);

  // Resolve currently selected live bus object from real-time fleet
  const selectedBus = useMemo<LiveBusVehicle | null>(() => {
    if (!selectedBusId) return null;
    return realtimeBusVehicles.find((v) => v.id === selectedBusId) || null;
  }, [selectedBusId, realtimeBusVehicles]);

  // Fetch bus route polyline & stops when user selects a live bus
  useEffect(() => {
    if (!selectedBus) {
      setSelectedBusRouteDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingRouteDetail(true);

    transitApi
      .getBusRouteDetail(
        selectedBus.category,
        selectedBus.routeId || selectedBus.routeShortName,
        selectedBus.tripId || undefined
      )
      .then((json) => {
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

  // Build active Live Tracker display object & push real-time Lock-Screen Notification updates
  const activeTrackerDisplay = useMemo<ActiveTrackerDisplay | null>(() => {
    if (!trackedTarget) return null;

    if (trackedTarget.kind === 'rail') {
      const dataSrc =
        trackedDepartures?.station.stopId === trackedTarget.stopId
          ? trackedDepartures
          : departures?.station.stopId === trackedTarget.stopId
            ? departures
            : null;
      const st =
        dataSrc?.station || railData?.stations.find((s) => s.stopId === trackedTarget.stopId);
      if (!st) return null;

      const nextDir = dataSrc?.directions?.[0];
      const nextTrain = nextDir?.upcoming?.[0];
      const isTimetable = dataSrc?.scheduleMode === 'timetable';
      const primaryMetric = isTimetable
        ? nextTrain
          ? formatCountdown(nextTrain.minutesAway, nextTrain.isTomorrow, lang)
          : '—'
        : nextDir
          ? nextTrain?.isTomorrow
            ? t.serviceEnded
            : t.everyXMin(nextDir.currentHeadwayMinutes)
          : '—';
      const subtitle = nextDir
        ? isTimetable
          ? `${t.liveTrackTowards(nextDir.destinationName)}${nextTrain ? ` · ${nextTrain.arrivalTime}` : ''}`
          : `${t.liveTrackTowards(nextDir.destinationName)} · ${nextDir.firstTrain}–${nextDir.lastTrain}`
        : `${st.category} ${st.routeLongName}`;

      return {
        kind: 'rail',
        id: `rail:${st.stopId}`,
        badge: st.stopId,
        color: st.routeColor,
        title: st.displayName,
        subtitle,
        primaryMetric,
        lat: st.lat,
        lon: st.lon,
      };
    }

    const bus = realtimeBusVehicles.find((v) => v.id === trackedTarget.busId);
    if (!bus) return null;

    return {
      kind: 'bus',
      id: `bus:${bus.id}`,
      badge: bus.routeShortName,
      color: bus.color,
      title: bus.headsign || bus.routeLongName,
      subtitle: `${bus.licensePlate} · ${t.agoShort(bus.updatedSecondsAgo)}`,
      primaryMetric: `${bus.speedKmh} km/h`,
      lat: bus.lat,
      lon: bus.lon,
    };
  }, [trackedTarget, trackedDepartures, departures, railData, realtimeBusVehicles, lang, t]);

  // Push real-time notification updates to Android Lock Screen / Status Bar & Web Title
  useEffect(() => {
    if (!trackedTarget || !activeTrackerDisplay) {
      liveNotificationService.dismiss();
      return;
    }

    if (trackedTarget.kind === 'rail') {
      const dataSrc =
        trackedDepartures?.station.stopId === trackedTarget.stopId
          ? trackedDepartures
          : departures?.station.stopId === trackedTarget.stopId
            ? departures
            : null;
      const d1 = dataSrc?.directions?.[0];
      const d2 = dataSrc?.directions?.[1];
      const t1 = d1?.upcoming?.[0];
      const t2 = d2?.upcoming?.[0];

      const isTimetable = dataSrc?.scheduleMode === 'timetable';
      const linesText: string[] = [];
      if (d1 && t1) {
        linesText.push(
          isTimetable
            ? t.liveTrackNextTrain(
                formatCountdown(t1.minutesAway, t1.isTomorrow, lang),
                t1.arrivalTime,
                d1.destinationName
              )
            : t.liveTrackFreqLine(d1.currentHeadwayMinutes, d1.destinationName, d1.lastTrain)
        );
      }
      if (d2 && t2) {
        linesText.push(
          isTimetable
            ? t.liveTrackNextTrain(
                formatCountdown(t2.minutesAway, t2.isTomorrow, lang),
                t2.arrivalTime,
                d2.destinationName
              )
            : t.liveTrackFreqLine(d2.currentHeadwayMinutes, d2.destinationName, d2.lastTrain)
        );
      }
      const headway = d1?.currentHeadwayMinutes || 6;
      const progress =
        isTimetable && t1 && !t1.isTomorrow
          ? Math.max(0, headway - Math.min(headway, t1.minutesAway))
          : undefined;

      liveNotificationService.showOrUpdate(
        {
          title: `${activeTrackerDisplay.badge} ${activeTrackerDisplay.title} · ${activeTrackerDisplay.primaryMetric}`,
          body: linesText.join('\n') || activeTrackerDisplay.subtitle,
          subText: dataSrc?.queryTimeMyt
            ? `${isTimetable ? 'LIVE' : 'GTFS'} · ${dataSrc.queryTimeMyt} MYT`
            : isTimetable
              ? 'LIVE'
              : 'GTFS',
          stopLabel: t.liveTrackStop,
          colorHex: activeTrackerDisplay.color,
          progress,
          maxProgress: progress !== undefined ? headway : undefined,
        },
        `${activeTrackerDisplay.primaryMetric} ${activeTrackerDisplay.title}`
      );
      return;
    }

    const bus = busData?.vehicles.find((v) => v.id === trackedTarget.busId);
    if (bus) {
      liveNotificationService.showOrUpdate(
        {
          title: `Bus ${bus.routeShortName} · ${bus.speedKmh} km/h`,
          body: t.liveTrackBusSummary(
            bus.speedKmh,
            bus.licensePlate,
            bus.headsign || bus.routeLongName
          ),
          subText: `LIVE GPS · ${t.agoShort(bus.updatedSecondsAgo)}`,
          stopLabel: t.liveTrackStop,
          colorHex: bus.color,
        },
        `Bus ${bus.routeShortName} (${bus.speedKmh} km/h)`
      );
    }
  }, [trackedTarget, activeTrackerDisplay, trackedDepartures, departures, busData, lang, t]);

  const handleToggleTrackStation = useCallback(
    async (stopId: string) => {
      if (trackedTarget?.kind === 'rail' && trackedTarget.stopId === stopId) {
        setTrackedTarget(null);
        await liveNotificationService.dismiss();
        return;
      }
      const granted = await liveNotificationService.requestPermission();
      if (!granted && Capacitor.isNativePlatform()) {
        showToast(t.liveTrackPermissionHint);
      }
      setTrackedTarget({ kind: 'rail', stopId });
    },
    [trackedTarget, showToast, t.liveTrackPermissionHint]
  );

  const handleToggleTrackBus = useCallback(
    async (bus: LiveBusVehicle) => {
      if (trackedTarget?.kind === 'bus' && trackedTarget.busId === bus.id) {
        setTrackedTarget(null);
        await liveNotificationService.dismiss();
        return;
      }
      const granted = await liveNotificationService.requestPermission();
      if (!granted && Capacitor.isNativePlatform()) {
        showToast(t.liveTrackPermissionHint);
      }
      setTrackedTarget({ kind: 'bus', busId: bus.id });
    },
    [trackedTarget, showToast, t.liveTrackPermissionHint]
  );

  // Favorite stations resolved from railData
  const favoriteStations = useMemo(() => {
    if (!railData || favoriteIds.length === 0) return [];
    const byId = new Map(railData.stations.map((s) => [s.stopId, s]));
    return favoriteIds.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
  }, [railData, favoriteIds]);

  // Filtered rail stations for the sidebar list (uses dedicated railSearchQuery)
  const filteredStations = useMemo(() => {
    if (!railData) return [];
    const q = normalizeSearch(railSearchQuery);
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
  }, [railData, selectedLineId, railSearchQuery]);

  const handleSetMyBusStation = useCallback(
    (station: MyBusStation) => {
      setMyBusStation(station);
      showToast(t.myStationSetToast(station.stopName));
    },
    [setMyBusStation, showToast, t]
  );

  const handleSetMyRailStation = useCallback(
    (station: MyRailStation) => {
      setMyRailStation(station);
      showToast(`${t.myRailStationLabel}: ${station.displayName}`);
    },
    [setMyRailStation, showToast, t.myRailStationLabel]
  );

  const handleShowBusesOnMap = useCallback(() => {
    setMode((prev) => (prev === 'rail' ? 'bus' : prev));
    setMobileView('map');
  }, []);

  const handleFocusMyStationOnMap = useCallback(() => {
    setMode((prev) => (prev === 'rail' ? 'all' : prev));
    setMobileView('map');
    setFocusMyStationSeq((n) => n + 1);
  }, []);

  const handleSelectStation = useCallback((stopId: string, openDetailOnMobile = true) => {
    setShowNearbyView(false);
    setFocusedBusStop(null);
    setSelectedStationId(stopId);
    setSelectedBusId(null);
    setMode((prev) => (prev === 'bus' ? 'all' : prev));
    if (openDetailOnMobile) {
      setMobileView('list');
    }
  }, []);

  const handleSelectBus = useCallback((bus: LiveBusVehicle | null, openDetailOnMobile = true) => {
    if (bus) setShowNearbyView(false);
    setFocusedBusStop(null);
    setSelectedBusId(bus ? bus.id : null);
    if (bus) {
      setSelectedStationId(null);
      setMode((prev) => (prev === 'rail' ? 'bus' : prev));
      if (openDetailOnMobile) {
        setMobileView('list');
      }
    }
  }, []);

  const handleSelectNearbyBusStop = useCallback((stop: NearbyBusStop) => {
    setFocusedBusStop(stop);
    setSelectedStationId(null);
    setSelectedBusId(null);
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
    try {
      const priorityCat: BusCategory | undefined =
        selectedBus?.category ||
        (busCategoryFilter !== 'all' ? busCategoryFilter : undefined);
      const tasks: Promise<unknown>[] = [fetchLiveBuses(true, priorityCat)];
      if (selectedStationId) {
        tasks.push(fetchStationDepartures(selectedStationId, customTime, customDay));
      } else if (!railData) {
        tasks.push(fetchRailNetwork());
      }
      if (myRailStation) {
        tasks.push(refreshMyRailStation(myRailStation.stopId));
      }
      if (trackedTarget?.kind === 'rail') {
        tasks.push(refreshTrackedStation(trackedTarget.stopId));
      }
      if (userLocation && showNearbyView) {
        tasks.push(fetchNearbyStops(userLocation.lat, userLocation.lon));
      }
      await Promise.all(tasks);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    selectedBus?.category,
    busCategoryFilter,
    fetchLiveBuses,
    selectedStationId,
    fetchStationDepartures,
    customTime,
    customDay,
    railData,
    fetchRailNetwork,
    myRailStation,
    refreshMyRailStation,
    trackedTarget,
    refreshTrackedStation,
    userLocation,
    showNearbyView,
    fetchNearbyStops,
  ]);

  const handleToggleMapLayer = useCallback(() => {
    setMode((prev) => (prev === 'rail' ? 'all' : prev === 'bus' ? 'all' : 'rail'));
  }, []);

  // Decide which panel content renders in the left workspace
  const showingBusPanel = mode === 'bus' || (mode === 'all' && selectedBus !== null);

  // Active bottom nav tab on mobile
  const activeMobileTab: 'rail' | 'bus' | 'nearby' | 'map' =
    mobileView === 'map'
      ? 'map'
      : showNearbyView
        ? 'nearby'
        : showingBusPanel
          ? 'bus'
          : 'rail';

  const handleMobileNavSelect = (tab: 'rail' | 'bus' | 'nearby' | 'map') => {
    if (tab === 'map') {
      setMobileView('map');
      return;
    }
    if (tab === 'nearby') {
      setMobileView('list');
      setShowNearbyView(true);
      setSelectedStationId(null);
      setSelectedBusId(null);
      if (!userLocation && !locating) {
        locateUser(true);
      }
      return;
    }
    setMobileView('list');
    setShowNearbyView(false);
    if (tab === 'bus') {
      setMode('bus');
      setSelectedStationId(null);
    } else {
      setMode('rail');
      setSelectedBusId(null);
    }
  };

  return (
    <div className="h-dvh w-screen flex flex-col bg-white overflow-hidden safe-area-shell">
      <TopBar
        mode={mode}
        onModeChange={handleModeChange}
        onRefresh={handleManualRefresh}
        onOpenTripPlanner={() => {
          setTripPlannerTab(showingBusPanel ? 'bus' : 'rail');
          setTripPlannerOpen(true);
        }}
        onOpenFontPicker={() => setFontPickerOpen(true)}
        isRefreshing={isRefreshing}
        nextRefreshInSec={2}
      />

      {/* Live Activity / Lock-Screen Sync Banner */}
      <LiveTrackerPill
        tracker={activeTrackerDisplay}
        onFocus={() => {
          if (!trackedTarget) return;
          if (trackedTarget.kind === 'rail') {
            handleSelectStation(trackedTarget.stopId, true);
          } else {
            const bus = busData?.vehicles.find((v) => v.id === trackedTarget.busId);
            if (bus) handleSelectBus(bus, true);
          }
        }}
        onDirections={() => {
          if (!activeTrackerDisplay) return;
          setDirectionsTarget({
            name: activeTrackerDisplay.title,
            subtitle: activeTrackerDisplay.subtitle,
            badge: activeTrackerDisplay.badge,
            color: activeTrackerDisplay.color,
            lat: activeTrackerDisplay.lat,
            lon: activeTrackerDisplay.lon,
            kind: activeTrackerDisplay.kind === 'bus' ? 'bus-live' : 'rail',
          });
        }}
        onStop={() => {
          setTrackedTarget(null);
          liveNotificationService.dismiss();
        }}
      />

      {/* Main Split Workspace */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Left Interactive Transit Panel */}
        <aside
          className={`${
            mobileView === 'list' ? 'flex' : 'hidden'
          } md:flex flex-col w-full md:w-[420px] lg:w-[440px] shrink-0 bg-white border-r border-slate-200/90 min-h-0 z-20`}
        >
          {/* Separate Search Bars for Rail vs Bus + GPS Nearby Chip */}
          {!showNearbyView && (
            <div className="p-3.5 md:p-4 border-b border-slate-200/80 shrink-0 bg-white space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={showingBusPanel ? busSearchQuery : railSearchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (showingBusPanel) {
                        setBusSearchQuery(val);
                      } else {
                        setRailSearchQuery(val);
                      }
                      if (showNearbyView) setShowNearbyView(false);
                    }}
                    placeholder={
                      showingBusPanel ? t.searchBusPlaceholder : t.searchRailPlaceholder
                    }
                    className="w-full pl-10 pr-8 py-2.5 text-sm bg-slate-100/90 border border-slate-200/80 rounded-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-600/15 transition-all"
                  />
                  {(showingBusPanel ? busSearchQuery : railSearchQuery) && (
                    <button
                      type="button"
                      aria-label={t.clearSearchAria}
                      onClick={() =>
                        showingBusPanel ? setBusSearchQuery('') : setRailSearchQuery('')
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded-full cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={requestUserLocation}
                  disabled={locating}
                  title={t.nearMeTitle}
                  className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold rounded-full border shadow-2xs active:scale-95 transition-all whitespace-nowrap shrink-0 cursor-pointer bg-blue-50 border-blue-200/80 text-blue-700 hover:bg-blue-100"
                >
                  <LocateFixed className={`w-4 h-4 ${locating ? 'animate-spin' : ''}`} />
                  <span>{locating ? t.locatingShort : t.nearMe}</span>
                </button>
              </div>

              {/* Rail Line Material Filter Chips when viewing Rail station list */}
              {!showingBusPanel && !selectedStationId && railData && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setSelectedLineId('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 active:scale-95 transition-all cursor-pointer ${
                      selectedLineId === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                  >
                    {t.allLines} ({railData.lines.length})
                  </button>
                  {railData.lines.map((line) => {
                    const active = selectedLineId === line.routeId;
                    return (
                      <button
                        key={line.routeId}
                        type="button"
                        onClick={() => setSelectedLineId(line.routeId)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap shrink-0 active:scale-95 transition-all cursor-pointer ${
                          active
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-black/10"
                          style={{ backgroundColor: line.color }}
                        />
                        <span className="font-mono font-bold">{line.shortName}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Quick mode switch note when in 'all' mode */}
              {mode === 'all' && !selectedStationId && !selectedBus && (
                <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                  <span>{t.showingAllSummary(busData?.counts.total ?? 0)}</span>
                  <button
                    type="button"
                    onClick={() => setMode('bus')}
                    className="font-semibold text-blue-600 hover:text-blue-800 cursor-pointer whitespace-nowrap"
                  >
                    {t.viewBusList} →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Scrollable Panel Body with Pull-to-Refresh for instant GPS updates */}
          <PullToRefresh
            onRefresh={handleManualRefresh}
            pullLabel={t.ptrPull}
            releaseLabel={t.ptrRelease}
            refreshingLabel={t.ptrRefreshing}
            className="flex-1 overflow-y-auto transit-scroll min-h-0"
          >
            {showNearbyView ? (
              <NearbyPanel
                userLocation={userLocation}
                nearbyData={nearbyData}
                myBusStation={myBusStation}
                locating={locating}
                loadingNearby={loadingNearby}
                locationError={locationError}
                isSimulatedKl={isSimulatedKl}
                onRequestGps={requestUserLocation}
                onTryKlSample={handleTryKlSampleLocation}
                onSelectStation={(id) => handleSelectStation(id, true)}
                onSelectBusStop={handleSelectNearbyBusStop}
                onSetMyBusStation={handleSetMyBusStation}
                onOpenDirections={setDirectionsTarget}
                onBack={() => setShowNearbyView(false)}
              />
            ) : showingBusPanel ? (
              <BusLivePanel
                data={busData}
                liveVehicles={realtimeBusVehicles}
                loading={busLoading}
                error={busError}
                searchQuery={busSearchQuery}
                busCategoryFilter={busCategoryFilter}
                selectedBus={selectedBus}
                selectedBusRouteDetail={selectedBusRouteDetail}
                loadingRouteDetail={loadingRouteDetail}
                isTrackingBus={
                  trackedTarget?.kind === 'bus' &&
                  !!selectedBus &&
                  trackedTarget.busId === selectedBus.id
                }
                myBusStation={myBusStation}
                myBusArrivals={myBusArrivals}
                myBusArrivalsLoading={myBusArrivalsLoading}
                onCategoryChange={setBusCategoryFilter}
                onSelectBus={(bus) => handleSelectBus(bus, true)}
                onToggleTrackBus={() => selectedBus && handleToggleTrackBus(selectedBus)}
                onShowOnMap={handleShowBusesOnMap}
                onFocusMyStationOnMap={handleFocusMyStationOnMap}
                onOpenMyBusSetup={() => setMyStationSetupMode('bus')}
                onOpenBusTripPlanner={() => {
                  setTripPlannerTab('bus');
                  setTripPlannerOpen(true);
                }}
                onOpenDirections={setDirectionsTarget}
                onRetry={() =>
                  fetchLiveBuses(
                    true,
                    busCategoryFilter !== 'all' ? busCategoryFilter : undefined
                  )
                }
              />
            ) : selectedStationId ? (
              <StationDepartureBoard
                data={departures}
                loading={departuresLoading}
                error={departuresError}
                customTime={customTime}
                customDay={customDay}
                isFavorite={isFavorite(selectedStationId)}
                isTracking={
                  trackedTarget?.kind === 'rail' && trackedTarget.stopId === selectedStationId
                }
                onCustomTimeChange={setCustomTime}
                onCustomDayChange={setCustomDay}
                onSelectStation={(id) => handleSelectStation(id, true)}
                onToggleFavorite={toggleFavorite}
                onToggleTrack={() => handleToggleTrackStation(selectedStationId)}
                onOpenDirections={setDirectionsTarget}
                onBack={() => setSelectedStationId(null)}
                onRetry={() =>
                  selectedStationId &&
                  fetchStationDepartures(selectedStationId, customTime, customDay)
                }
              />
            ) : (
              <div className="p-4 space-y-5 pb-6">
                {railLoading && !railData ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-4 w-36 bg-slate-200 rounded-full" />
                    <div className="grid grid-cols-2 gap-2.5">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <div key={n} className="h-16 bg-slate-100 rounded-2xl" />
                      ))}
                    </div>
                    <div className="h-4 w-28 bg-slate-200 rounded-full mt-4" />
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="h-14 bg-slate-100 rounded-2xl" />
                    ))}
                  </div>
                ) : railError && !railData ? (
                  <div className="p-5 border border-red-200 bg-red-50 rounded-2xl space-y-3">
                    <p className="text-sm font-medium text-red-900">{railError}</p>
                    <button
                      type="button"
                      onClick={fetchRailNetwork}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-xs active:scale-95 transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{t.reloadData}</span>
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Dedicated My Rail Station Live Card (instant countdown right on app open!) */}
                    {!railSearchQuery && selectedLineId === 'all' && (
                      <section className="space-y-2.5">
                        {!myRailStation ? (
                          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/70 border border-blue-200/80 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                                <Home className="w-4.5 h-4.5" />
                              </span>
                              <div className="min-w-0">
                                <div className="font-display text-sm font-bold text-slate-950 truncate">
                                  {t.myRailStationLabel}
                                </div>
                                <div className="text-xs text-slate-600 line-clamp-1">
                                  {t.setupMyRailSub}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setMyStationSetupMode('rail')}
                              className="px-3.5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold shadow-xs shrink-0 transition-all cursor-pointer"
                            >
                              {t.setupBtn}
                            </button>
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-50/90 to-white border border-blue-200/90 shadow-2xs space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => handleSelectStation(myRailStation.stopId, true)}
                                className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                              >
                                <span
                                  className="px-2 py-1 rounded-xl font-mono text-xs font-bold text-white shrink-0 shadow-2xs"
                                  style={{ backgroundColor: myRailStation.routeColor }}
                                >
                                  {myRailStation.stopId}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-[10px] font-bold uppercase tracking-wide text-blue-700">
                                    {t.myRailStationLabel}
                                  </div>
                                  <div className="font-display text-sm font-bold text-slate-950 truncate">
                                    {myRailStation.displayName}
                                  </div>
                                </div>
                              </button>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDirectionsTarget({
                                      name: myRailStation.displayName,
                                      subtitle: `${myRailStation.category} ${myRailStation.routeLongName}`,
                                      badge: myRailStation.stopId,
                                      color: myRailStation.routeColor,
                                      lat: myRailStation.lat,
                                      lon: myRailStation.lon,
                                      kind: 'rail',
                                    })
                                  }
                                  aria-label={t.directionsBtn}
                                  title={t.directionsBtn}
                                  className="w-8 h-8 inline-flex items-center justify-center rounded-full bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 active:scale-95 cursor-pointer"
                                >
                                  <Navigation className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMyStationSetupMode('rail')}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white border border-blue-200 hover:bg-blue-50 text-blue-800 text-[11px] font-semibold active:scale-95 cursor-pointer"
                                >
                                  <Settings2 className="w-3 h-3" />
                                  <span>{t.changeStationBtn}</span>
                                </button>
                              </div>
                            </div>

                            {myRailDepartures?.directions?.length ? (
                              <div className="grid grid-cols-1 gap-1.5">
                                {myRailDepartures.directions.slice(0, 2).map((dir) => {
                                  const next = dir.upcoming[0];
                                  if (!next) return null;
                                  const isTimetable = myRailDepartures.scheduleMode === 'timetable';
                                  return (
                                    <button
                                      key={dir.tripId}
                                      type="button"
                                      onClick={() =>
                                        handleSelectStation(myRailStation.stopId, true)
                                      }
                                      className="px-3 py-2 rounded-xl bg-white border border-blue-100 flex items-center justify-between gap-2 text-left hover:bg-blue-50/40 cursor-pointer"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-[11px] text-slate-400">
                                          {t.towards}
                                        </div>
                                        <div className="text-xs font-bold text-slate-900 truncate">
                                          {dir.destinationName}
                                        </div>
                                      </div>
                                      <div className="text-right shrink-0">
                                        {isTimetable ? (
                                          <>
                                            <div
                                              className={`font-mono text-sm font-extrabold tabular-nums ${
                                                next.isTomorrow
                                                  ? 'text-amber-700'
                                                  : next.minutesAway <= 1
                                                    ? 'text-emerald-600'
                                                    : 'text-slate-950'
                                              }`}
                                            >
                                              {formatCountdown(next.minutesAway, next.isTomorrow, lang)}
                                            </div>
                                            <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                                              {next.arrivalTime}
                                            </div>
                                          </>
                                        ) : next.isTomorrow ? (
                                          <>
                                            <div className="font-display text-xs font-bold text-amber-700">
                                              {t.serviceEnded}
                                            </div>
                                            <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                                              {t.firstTrainAt(dir.firstTrain)}
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <div
                                              className={`font-display text-xs font-extrabold tabular-nums ${
                                                dir.isPeakNow ? 'text-emerald-700' : 'text-blue-700'
                                              }`}
                                            >
                                              {t.everyXMin(dir.currentHeadwayMinutes)}
                                              {dir.isPeakNow ? ` · ${t.peakHours}` : ''}
                                            </div>
                                            <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                                              {dir.firstTrain} – {dir.lastTrain}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        )}

                        {/* Compact Live Bus Preview Strip right on App Open if My Bus Station is configured */}
                        {myBusStation && (
                          <button
                            type="button"
                            onClick={() => {
                              setMode('bus');
                              setSelectedStationId(null);
                              setMobileView('list');
                            }}
                            className="w-full px-3.5 py-2.5 rounded-2xl bg-emerald-50/90 hover:bg-emerald-50 border border-emerald-200/90 flex items-center justify-between gap-2.5 text-left active:scale-[0.99] transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-7.5 h-7.5 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                <Bus className="w-4 h-4" />
                              </span>
                              <div className="min-w-0">
                                <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 truncate">
                                  {t.myBusStationLabel} · {myBusStation.stopName}
                                </div>
                                <div className="text-xs font-bold text-slate-900 truncate">
                                  {myBusArrivals[0] ? (
                                    <span className="inline-flex items-center gap-1.5">
                                      <Radio className="w-3 h-3 text-emerald-600 animate-pulse shrink-0" />
                                      <span>
                                        Bus {myBusArrivals[0].routeShortName} ·{' '}
                                        {t.stopsRemaining(myBusArrivals[0].stopsAway)}
                                      </span>
                                    </span>
                                  ) : (
                                    t.myBusArrivalsTitle
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="font-mono text-sm font-extrabold text-emerald-700 tabular-nums shrink-0">
                              {myBusArrivals[0] ? `~${myBusArrivals[0].etaMinutes}m` : '→'}
                            </span>
                          </button>
                        )}
                      </section>
                    )}

                    {/* Quick Action Entry Cards (Trip Planner + Nearest Stop Directions) */}
                    {!railSearchQuery && selectedLineId === 'all' && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setTripPlannerTab('rail');
                            setTripPlannerOpen(true);
                          }}
                          className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white text-left shadow-sm shadow-blue-600/20 active:scale-[0.98] transition-all cursor-pointer space-y-1.5"
                        >
                          <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                            <Route className="w-4 h-4" />
                          </span>
                          <div className="font-display text-sm font-bold leading-tight">
                            {t.tripPlanner}
                          </div>
                          <div className="text-[11px] text-blue-100 truncate">
                            MRT · LRT · Monorail
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleMobileNavSelect('nearby')}
                          className="p-3.5 rounded-2xl bg-slate-900 text-white text-left shadow-sm active:scale-[0.98] transition-all cursor-pointer space-y-1.5"
                        >
                          <span className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center">
                            <Navigation className="w-4 h-4 text-sky-300" />
                          </span>
                          <div className="font-display text-sm font-bold leading-tight">
                            {t.navNearby}
                          </div>
                          <div className="text-[11px] text-slate-300 truncate">
                            GPS · Google Maps
                          </div>
                        </button>
                      </div>
                    )}

                    {/* Saved / Favorite Stations */}
                    {!railSearchQuery && selectedLineId === 'all' && favoriteStations.length > 0 && (
                      <section className="space-y-2">
                        <div className="flex items-center gap-1.5 px-0.5">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          <h2 className="font-display text-sm font-bold text-slate-900">
                            {t.savedStations}
                          </h2>
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                          {favoriteStations.map((st) => (
                            <button
                              key={st.stopId}
                              type="button"
                              onClick={() => handleSelectStation(st.stopId, true)}
                              className="shrink-0 px-3.5 py-2.5 rounded-2xl bg-amber-50/70 hover:bg-amber-50 border border-amber-200/80 text-left active:scale-95 transition-all cursor-pointer flex items-center gap-2.5"
                            >
                              <span
                                className="px-1.5 py-0.5 rounded-md font-mono text-[11px] font-bold text-white"
                                style={{ backgroundColor: st.routeColor }}
                              >
                                {st.stopId}
                              </span>
                              <span className="text-xs font-bold text-slate-900 whitespace-nowrap">
                                {st.displayName}
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Popular KL Hubs for 1-click departure check */}
                    {!railSearchQuery && selectedLineId === 'all' && (
                      <section className="space-y-2.5">
                        <div className="flex items-baseline justify-between px-0.5">
                          <h2 className="font-display text-sm font-bold text-slate-900">
                            {t.popularHubs}
                          </h2>
                          <span className="text-xs text-slate-400">{t.tapForSchedule}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          {POPULAR_KL_HUBS.map((hub) => {
                            const match = railData?.stations.find((s) => s.stopId === hub.stopId);
                            return (
                              <button
                                key={hub.stopId}
                                type="button"
                                onClick={() => handleSelectStation(hub.stopId, true)}
                                className="p-3.5 text-left bg-white hover:bg-slate-50 active:scale-[0.98] border border-slate-200/90 hover:border-blue-300 rounded-2xl shadow-2xs transition-all cursor-pointer space-y-1"
                              >
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
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
                            ? t.allRailStations
                            : railData?.lines.find((l) => l.routeId === selectedLineId)
                                ?.longName || t.allRailStations}
                        </h2>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          {t.stationsCount(filteredStations.length)}
                        </span>
                      </div>

                      {filteredStations.length === 0 ? (
                        <div className="p-6 text-center border border-slate-200 rounded-2xl space-y-2.5 bg-white">
                          <p className="text-sm font-semibold text-slate-800">
                            {t.noStationsMatch}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setRailSearchQuery('');
                              setSelectedLineId('all');
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full cursor-pointer"
                          >
                            {t.clearFilters}
                          </button>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
                          {filteredStations.map((st) => (
                            <button
                              key={st.stopId}
                              type="button"
                              onClick={() => handleSelectStation(st.stopId, true)}
                              className="w-full px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 active:bg-slate-100/70 text-left transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span
                                  className="shrink-0 min-w-[46px] text-center px-1.5 py-0.5 rounded-lg font-mono text-[11px] font-bold text-white tabular-nums shadow-2xs"
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
                                      ? ` · ${st.interchanges
                                          .map((i) => i.routeShortName)
                                          .join(', ')}`
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
                      <div className="pt-1 text-[11px] text-slate-400 flex items-center justify-between">
                        <span>{railData.source}</span>
                        <span className="font-mono tabular-nums">
                          {railData.lines.length} {lang === 'en' ? 'lines' : 'tuyến'}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </PullToRefresh>

          {/* Compact PWA Install Bar (auto-hides once installed as standalone app / native APK) */}
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
            isVisible={mobileView === 'map'}
            lines={railData?.lines || []}
            stations={railData?.stations || []}
            selectedLineId={selectedLineId}
            selectedStationId={selectedStationId}
            liveBuses={realtimeBusVehicles}
            busCategoryFilter={busCategoryFilter}
            busSearchQuery={busSearchQuery}
            selectedBus={selectedBus}
            selectedBusRouteDetail={selectedBusRouteDetail}
            userLocation={userLocation}
            focusedBusStop={focusedBusStop}
            myBusStation={myBusStation}
            focusMyStationSeq={focusMyStationSeq}
            isLocating={locating}
            trackingId={activeTrackerDisplay?.id || null}
            onSelectStation={handleSelectStation}
            onSelectBus={handleSelectBus}
            onModeChange={handleModeChange}
            onToggleMode={handleToggleMapLayer}
            onRequestLocation={requestUserLocation}
            onOpenDirections={setDirectionsTarget}
            onToggleTrackStation={handleToggleTrackStation}
            onToggleTrackBus={handleToggleTrackBus}
            onToggleMyBusStation={handleSetMyBusStation}
            onClearBusFilter={() => {
              setBusSearchQuery('');
              setSelectedBusId(null);
            }}
            onClearMapSelection={() => {
              setSelectedStationId(null);
              setSelectedBusId(null);
              setFocusedBusStop(null);
            }}
          />
        </main>

        <OfflineIndicator />
      </div>

      {/* Mobile Material 3 Thumb-Zone Bottom Navigation Bar */}
      <nav
        aria-label={t.navAriaLabel}
        className="md:hidden shrink-0 bg-white border-t border-slate-200/90 px-2 py-1.5 grid grid-cols-4 gap-1 z-30 shadow-[0_-2px_10px_rgba(15,23,42,0.05)]"
      >
        {(
          [
            { id: 'rail' as const, label: t.modeRail, icon: TrainFront },
            { id: 'bus' as const, label: t.modeBus, icon: Bus },
            { id: 'nearby' as const, label: t.navNearby, icon: LocateFixed },
            { id: 'map' as const, label: t.navMap, icon: MapIcon },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeMobileTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleMobileNavSelect(tab.id)}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-0.5 py-1 cursor-pointer active:scale-95 transition-transform"
            >
              <span
                className={`px-4 py-1 rounded-full transition-colors ${
                  active ? 'bg-blue-100 text-blue-700' : 'text-slate-500'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
              </span>
              <span
                className={`text-[11px] leading-tight truncate max-w-full ${
                  active ? 'font-bold text-blue-700' : 'font-medium text-slate-500'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Multi-Modal Google Maps / Waze / Apple Maps Directions Bottom Sheet */}
      <DirectionsSheet
        target={directionsTarget}
        userLocation={userLocation}
        isLocating={locating}
        onRequestGps={requestUserLocationSilent}
        onClose={() => setDirectionsTarget(null)}
      />

      {/* Unified KL Rail + Bus Trip Planner & Fare Estimator Modal */}
      <TripPlannerModal
        open={tripPlannerOpen}
        initialTab={tripPlannerTab}
        lines={railData?.lines || []}
        stations={railData?.stations || []}
        liveVehicles={realtimeBusVehicles}
        userLocation={userLocation}
        myBusStation={myBusStation}
        nearestRailStopId={nearbyData?.railStations?.[0]?.stopId || null}
        nearestBusStop={nearbyData?.busStops?.[0] || null}
        onClose={() => setTripPlannerOpen(false)}
        onSelectStation={(id) => handleSelectStation(id, true)}
        onSelectBusById={(busId, openMap) => {
          const found = realtimeBusVehicles.find((v) => v.id === busId);
          if (found) {
            handleSelectBus(found, !openMap);
            if (openMap) {
              setMode((prev) => (prev === 'rail' ? 'bus' : prev));
              setMobileView('map');
            }
          }
        }}
        onOpenDirections={setDirectionsTarget}
      />

      {/* Dedicated My Rail / Bus Station Setup Modal */}
      <MyStationSetupModal
        mode={myStationSetupMode}
        railStations={railData?.stations || []}
        userLocation={userLocation}
        nearestRailStopId={nearbyData?.railStations?.[0]?.stopId || null}
        nearestBusStop={nearbyData?.busStops?.[0] || null}
        currentRailStation={myRailStation}
        currentBusStation={myBusStation}
        onSelectRailStation={handleSetMyRailStation}
        onSelectBusStation={handleSetMyBusStation}
        onClear={() => {
          if (myStationSetupMode === 'rail') setMyRailStation(null);
          else if (myStationSetupMode === 'bus') setMyBusStation(null);
        }}
        onClose={() => setMyStationSetupMode(null)}
      />

      {/* Google Fonts Picker Modal */}
      <FontPickerModal
        open={fontPickerOpen}
        currentFont={fontFamily}
        loadingFont={loadingFont}
        onSelectFont={setAppFont}
        onClose={() => setFontPickerOpen(false)}
      />

      {/* Subtle Material Snackbar Toast */}
      {toastMessage && (
        <div
          role="status"
          className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[1200] max-w-[90vw] px-4 py-2.5 rounded-2xl bg-slate-900 text-white text-xs font-medium shadow-xl text-center"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
